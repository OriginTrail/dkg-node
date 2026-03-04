import path from "path";
import {
  createPluginServer,
  defaultPlugin,
  type DkgPlugin,
} from "@dkg/plugins";
import { authorized, createOAuthPlugin } from "@dkg/plugin-oauth";
import dkgEssentialsPlugin from "@dkg/plugin-dkg-essentials";
import createFsBlobStorage from "@dkg/plugin-dkg-essentials/createFsBlobStorage";
import examplePlugin from "@dkg/plugin-example";
import swaggerPlugin from "@dkg/plugin-swagger";
// @ts-expect-error No types for dkg.js ...
import DKG from "dkg.js";
import { eq } from "drizzle-orm";
import { getTestMessageUrl } from "nodemailer";

import { userCredentialsSchema } from "@/shared/auth";
import { processStreamingCompletion } from "@/shared/chat";
import { verify } from "@node-rs/argon2";

import createAccountManagementPlugin from "./accountManagementPlugin";
import {
  SqliteAccountManagementProvider,
  SqliteOAuthStorageProvider,
  users,
} from "./database/sqlite";
import { configDatabase, configEnv } from "./helpers";
import mailer from "./mailer";
import webInterfacePlugin from "./webInterfacePlugin";

async function main() {
  configEnv();
  const db = configDatabase();
  const version = "1.0.0";

  const { oauthPlugin, openapiSecurityScheme } = createOAuthPlugin({
    storage: new SqliteOAuthStorageProvider(db),
    issuerUrl: new URL(process.env.EXPO_PUBLIC_MCP_URL),
    scopesSupported: [
      "mcp",
      "llm",
      "scope123",
      "blob",
      "epcis.read",
      "epcis.write",
    ],
    loginPageUrl: new URL(process.env.EXPO_PUBLIC_APP_URL + "/login"),
    schema: userCredentialsSchema,
    async login(credentials) {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, credentials.email))
        .then((results) => results.at(0));
      if (!user) throw new Error("Invalid credentials");

      const isValid = await verify(user.password, credentials.password);
      if (!isValid) throw new Error("Invalid credentials");

      return { scopes: user.scope.split(" "), extra: { userId: user.id } };
    },
  });

  const accountManagementPlugin = createAccountManagementPlugin({
    provider: new SqliteAccountManagementProvider(db),
    async sendMail(toEmail, code) {
      const transport = await mailer();
      if (!transport) throw new Error("No SMTP transport available");

      await transport
        .sendMail({
          to: toEmail,
          subject: "Password reset request | DKG Node",
          text:
            `Your password reset code is ${code}.` +
            `Link: ${process.env.EXPO_PUBLIC_APP_URL}/password-reset?code=${code}`,
          html:
            `<p>Your password reset code is <strong>${code}</strong>.</p>` +
            `<p>Please click <a href="${process.env.EXPO_PUBLIC_APP_URL}/password-reset?code=${code}">here</a> to reset your password.</p>`,
        })
        .then((info) => {
          console.debug(info);
          console.debug(getTestMessageUrl(info));
        });
    },
  });

  const blobStorage = createFsBlobStorage(path.join(__dirname, "../data"));
  const otnodeUrl = new URL(process.env.DKG_OTNODE_URL);
  const plugins: DkgPlugin[] = [
    defaultPlugin,
    oauthPlugin,
    (_, __, api) => {
      api.use("/mcp", authorized(["mcp"]));
      api.use("/mcp", (req, res, next) => {
        if (res.locals.auth) {
          (req as any).auth = res.locals.auth;
        }
        next();
      });
      api.use("/llm", authorized(["llm"]));
      api.use("/blob", authorized(["blob"]));
      api.use("/change-password", authorized([]));
      api.use("/profile", authorized([]));
    },
    (_, __, api) => {
      api.post("/llm", (req, res, next) => {
        if (!req.headers.accept?.includes("text/event-stream")) return next();
        processStreamingCompletion(req, res);
      });
    },
    accountManagementPlugin,
    dkgEssentialsPlugin,
  ];

  if (process.env.ASYNC_PUBLISHING_ENABLED === "true") {
    const { default: dkgPublisherPlugin } = await import(
      "@dkg/plugin-dkg-publisher"
    );
    plugins.push(dkgPublisherPlugin);
  }

  plugins.push(
    examplePlugin.withNamespace("protected", {
      middlewares: [authorized(["scope123"])],
    }),
    swaggerPlugin({
      version,
      securitySchemes: {
        oauth2: openapiSecurityScheme,
        bearer: { type: "http", scheme: "bearer" },
      },
      servers: [
        {
          url: process.env.EXPO_PUBLIC_MCP_URL,
          description: "DKG Node MCP Plugins Server",
        },
      ],
    }),
    webInterfacePlugin(path.join(__dirname, "./app")),
  );

  const app = createPluginServer({
    name: "DKG API",
    version,
    context: {
      blob: blobStorage,
      dkg: new DKG({
        endpoint: `${otnodeUrl.protocol}//${otnodeUrl.hostname}`,
        port: otnodeUrl.port || "8900",
        blockchain: {
          name: process.env.DKG_BLOCKCHAIN,
          privateKey: process.env.DKG_PUBLISH_WALLET,
        },
        maxNumberOfRetries: 300,
        frequency: 2,
        contentType: "all",
        nodeApiVersion: "/v1",
      }),
    },
    plugins,
  });

  const port = process.env.PORT || 9200;
  const server = app.listen(port, (error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    console.log(`Server running at http://localhost:${port}/`);

    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      server.close((closeError) => {
        if (closeError) {
          console.error(closeError);
          process.exit(1);
        }
        process.exit(0);
      });
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
