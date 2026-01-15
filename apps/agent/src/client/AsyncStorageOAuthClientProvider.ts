import AsyncStorage from "@react-native-async-storage/async-storage";

import { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export default class AsyncStorageOAuthClientProvider
  implements OAuthClientProvider
{
  constructor(
    private readonly _uri: string | URL,
    private readonly _redirectUrl: string | URL,
    private readonly _clientMetadata: OAuthClientMetadata,
    onRedirect?: (url: URL) => void,
  ) {
    this._onRedirect =
      onRedirect ||
      ((url) => {
        console.log(`Redirect to: ${url.toString()}`);
      });
  }

  private _onRedirect: (url: URL) => void;

  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this._onRedirect(authorizationUrl);
  }

  private _transformKey(key: string): string {
    return `[${this._uri.toString()}]_${key}`;
  }

  private async _save(key: string, value: any) {
    await AsyncStorage.setItem(this._transformKey(key), JSON.stringify(value));
  }

  private async _load(key: string): Promise<any> {
    const str = await AsyncStorage.getItem(this._transformKey(key));
    if (str === null) return undefined;
    return JSON.parse(str);
  }

  async logout() {
    await AsyncStorage.multiRemove([
      this._transformKey("tokens"),
      this._transformKey("codeVerifier"),
    ]);
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const info = await this._load("clientInfo");
    const clientId = (info as OAuthClientInformation | undefined)?.client_id;
    if (clientId) {
      const isInvalidClient = await fetch(
        new URL(this._uri.toString()).origin +
          "/authorize?client_id=" +
          clientId,
        { redirect: "manual" },
      )
        .then((r) => {
          if (r.status < 400) return {};
          return r.json();
        })
        .then((err: any) => {
          return err?.error === "invalid_client";
        })
        .catch((err) => {
          console.log("Error when checking client_id:", err);
          return false;
        });

      if (isInvalidClient) {
        await AsyncStorage.removeItem(this._transformKey("clientInfo"));
        await this.logout();
        return undefined;
      }
    }
    return info;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationFull,
  ): Promise<void> {
    await this._save("clientInfo", clientInformation);
  }

  tokens(): Promise<OAuthTokens | undefined> {
    return this._load("tokens");
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this._save("tokens", tokens);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this._save("codeVerifier", codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    const codeVerifier = await this._load("codeVerifier");
    if (!codeVerifier) {
      throw new Error("No code verifier saved");
    }
    return codeVerifier;
  }
}
