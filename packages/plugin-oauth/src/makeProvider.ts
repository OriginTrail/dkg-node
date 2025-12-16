import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InsufficientScopeError,
  InvalidTokenError,
  UnauthorizedClientError,
  InvalidScopeError,
  AccessDeniedError,
  InvalidGrantError,
  ServerError,
  InvalidRequestError,
  InvalidClientError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";

export default function makeProvider({
  storage,
  scopesSupported,
  tokenExpirationInSeconds,
  refreshTokenExpirationInSeconds,
  loginPageUrl,
  validateResource,
}: {
  storage: OAuthStorageProvider;
  scopesSupported?: string[];
  tokenExpirationInSeconds: number;
  refreshTokenExpirationInSeconds: number;
  loginPageUrl: URL;
  validateResource?: (resource?: URL) => Promise<boolean>;
}): OAuthServerProvider & {
  authorizeConfirm: (
    authorizationCode: string,
    confirmationData: CodeConfirmationData,
  ) => Promise<URL>;
} {
  async function createAndSaveOAuthTokens(
    clientId: string,
    scopes: string[],
    resource?: URL,
    includeRefreshToken?: boolean,
    extra?: Record<string, unknown>,
  ): Promise<OAuthTokens> {
    const token = uuidv4();
    try {
      await storage.saveToken(token, {
        token,
        clientId,
        scopes,
        expiresAt: Math.floor(Date.now() / 1000) + tokenExpirationInSeconds,
        resource,
        extra: { ...extra, type: "access" },
      });
    } catch (err) {
      throw new ServerError("Error saving token: " + String(err));
    }

    let refreshToken = undefined;
    if (includeRefreshToken) {
      refreshToken = uuidv4();
      try {
        await storage.saveToken(refreshToken, {
          token: refreshToken,
          clientId,
          scopes,
          expiresAt:
            Math.floor(Date.now() / 1000) + refreshTokenExpirationInSeconds,
          resource,
          extra: { ...extra, type: "refresh" },
        });
      } catch (err) {
        throw new ServerError("Error saving refresh token: " + String(err));
      }
    }

    return {
      access_token: token,
      token_type: "bearer",
      expires_in: tokenExpirationInSeconds,
      scope: scopes.join(" "),
      refresh_token: refreshToken,
    };
  }

  return {
    clientsStore: {
      getClient(clientId) {
        return storage.getClient(clientId);
      },
      async registerClient(_client) {
        const client: OAuthClientInformationFull = {
          ..._client,
          scope: scopesSupported?.join(" "),
          client_id: uuidv7(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        client.scope = scopesSupported?.join(" ");
        await storage.saveClient(client);
        return client;
      },
    },
    async authorizeConfirm(authorizationCode, confirmationData) {
      const codeData = await storage.getCodeData(authorizationCode);
      if (!codeData)
        throw new InvalidRequestError("Invalid authorization code");

      const { client, params } = codeData;
      const redirectUri = params.redirectUri || client.redirect_uris.at(0);
      if (!redirectUri)
        throw new InvalidClientError("No redirect URIs provided");

      if (!params.scopes?.every((s) => confirmationData.scopes.includes(s))) {
        throw new InsufficientScopeError("Scope not allowed");
      }

      try {
        await storage.confirmCode(authorizationCode, confirmationData);
      } catch (err) {
        throw new ServerError("Failed to confirm code: " + String(err));
      }

      const targetUrl = new URL(redirectUri);
      const searchParams = new URLSearchParams({ code: authorizationCode });
      if (params.state !== undefined) searchParams.set("state", params.state);
      targetUrl.search = searchParams.toString();
      return targetUrl;
    },
    async authorize(client, params, res) {
      const code = uuidv4();

      const clientScope = client.scope?.split(" ") || [];
      if (!params.scopes || params.scopes.length === 0)
        params.scopes = clientScope;

      try {
        await storage.saveCode(code, client, params);
      } catch (err) {
        throw new ServerError("Failed to save code: " + String(err));
      }

      const targetUrl = new URL(loginPageUrl);
      targetUrl.search = new URLSearchParams({ code }).toString();
      res.redirect(targetUrl.toString());
    },
    async challengeForAuthorizationCode(
      client,
      authorizationCode,
    ): Promise<string> {
      const codeData = await storage.getCodeData(authorizationCode);
      if (!codeData) {
        throw new InvalidGrantError("Invalid authorization code");
      }

      return codeData.params.codeChallenge;
    },
    async exchangeAuthorizationCode(client, authorizationCode) {
      const codeData = await storage.getCodeData(authorizationCode);
      if (!codeData) {
        throw new InvalidGrantError("Invalid authorization code");
      }

      if (codeData.client.client_id !== client.client_id) {
        throw new UnauthorizedClientError(
          `Authorization code was not issued to this client, ${codeData.client.client_id} != ${client.client_id}`,
        );
      }

      if (!codeData.confirmation) {
        throw new InvalidGrantError(
          "Authorization code is not confirmed - user did not login",
        );
      }

      if (validateResource && !validateResource(codeData.params.resource)) {
        throw new AccessDeniedError(
          `Invalid resource: ${codeData.params.resource}`,
        );
      }

      try {
        await storage.deleteCode(authorizationCode);
      } catch (err) {
        throw new ServerError(
          "Error deleting authorization code: " + String(err),
        );
      }

      return createAndSaveOAuthTokens(
        codeData.client.client_id,
        codeData.confirmation.scopes ?? [],
        codeData.params.resource,
        codeData.confirmation.includeRefreshToken,
        codeData.confirmation.extra,
      );
    },
    async exchangeRefreshToken(
      client: OAuthClientInformationFull,
      refreshToken: string,
      scopes?: string[],
      resource?: URL,
    ) {
      const tokenData = await storage.getTokenData(refreshToken);
      if (
        !tokenData ||
        !tokenData.expiresAt ||
        tokenData.expiresAt < Math.floor(Date.now() / 1000)
      ) {
        throw new InvalidGrantError("Invalid or expired refresh token");
      }

      if (tokenData.clientId !== client.client_id) {
        throw new UnauthorizedClientError(
          `Refresh token was not issued to this client, ${tokenData.clientId} != ${client.client_id}`,
        );
      }

      if (validateResource && !(await validateResource(resource))) {
        throw new AccessDeniedError(`Invalid resource: ${resource}`);
      }

      const allowedScopes = scopes ?? tokenData.scopes;
      if (!allowedScopes.every((s) => tokenData.scopes.includes(s))) {
        throw new InvalidScopeError(`Invalid scopes: ${allowedScopes}`);
      }

      return createAndSaveOAuthTokens(
        client.client_id,
        allowedScopes,
        resource,
        true,
        tokenData.extra,
      );
    },
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const tokenData = await storage.getTokenData(token);
      if (
        !tokenData ||
        !tokenData.expiresAt ||
        tokenData.expiresAt < Math.floor(Date.now() / 1000)
      ) {
        throw new InvalidTokenError("Invalid or expired token");
      }

      return {
        token,
        clientId: tokenData.clientId,
        scopes: tokenData.scopes,
        expiresAt: tokenData.expiresAt,
        resource: tokenData.resource,
        extra: tokenData.extra,
      };
    },
    async revokeToken(client, request) {
      const tokenData = await storage.getTokenData(request.token);
      if (
        !tokenData ||
        !tokenData.expiresAt ||
        tokenData.expiresAt < Math.floor(Date.now() / 1000)
      ) {
        return;
      }

      try {
        await storage.deleteToken(request.token);
      } catch (err) {
        throw new ServerError("Failed to revoke/delete token: " + String(err));
      }
    },
  };
}

export type CodeConfirmationData = {
  scopes: string[];
  includeRefreshToken: boolean;
  extra?: Record<string, unknown>;
};

export type OAuthStorageProvider = {
  saveCode: (
    code: string,
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
  ) => Promise<void>;
  confirmCode: (code: string, data: CodeConfirmationData) => Promise<void>;
  getCodeData: (code: string) => Promise<
    | {
      client: OAuthClientInformationFull;
      params: AuthorizationParams;
      confirmation: false | CodeConfirmationData;
    }
    | undefined
    | null
  >;
  deleteCode: (code: string) => Promise<void>;
  saveToken: (token: string, tokenData: AuthInfo) => Promise<void>;
  getTokenData: (token: string) => Promise<AuthInfo | undefined | null>;
  deleteToken: (token: string) => Promise<void>;
  saveClient: (client: OAuthClientInformationFull) => Promise<void>;
  getClient: (
    clientId: string,
  ) => Promise<OAuthClientInformationFull | undefined>;
};
