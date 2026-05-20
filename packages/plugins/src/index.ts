import express from "express";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcp } from "./registerMcp";
import { BlobStorage } from "./types";
export { withRequiredMcpScope } from "./mcpScopeGuard";

//@ts-ignore
import type DKG from "dkg.js";

export type DkgContext = {
  dkg: DKG;
  blob: BlobStorage;
};
export type DkgPlugin = (
  ctx: DkgContext,
  mcp: McpServer,
  api: express.Router,
) => void;
export type DkgPluginBuilderMethods = {
  withNamespace: (
    namespace: string,
    options?: { middlewares: express.Handler[] },
  ) => DkgPluginBuilder;
};
export type DkgPluginBuilder = DkgPlugin & DkgPluginBuilderMethods;

export const defineDkgPlugin = (plugin: DkgPlugin): DkgPluginBuilder =>
  Object.assign(plugin, {
    withNamespace(
      namespace: string,
      options?: { middlewares: express.Handler[] },
    ) {
      return defineDkgPlugin((ctx, mcp, api) => {
        const router = express.Router();
        options?.middlewares.forEach((m) => router.use(m));
        // Required patch in order for @dkg/plugin-swagger to work!
        Object.assign(router, { prefix: "/" + namespace });

        const mockRegistrationFns = (...fns: (keyof typeof mcp)[]) => {
          const impls: Record<string, Function> = {};

          for (const fnKey of fns) {
            if (typeof mcp[fnKey] !== "function") continue;

            impls[fnKey] = mcp[fnKey] as Function;
            (mcp as any)[fnKey] = (...args: any[]) => {
              if (typeof args[0] !== "string") {
                console.warn(
                  `Expected string as first argument for "mcp.${fnKey}" - skipping it.`,
                );
              } else {
                args[0] = `${namespace}__${args[0]}`;
              }

              return impls[fnKey]!.bind(mcp)(...args);
            };
          }

          return () => {
            for (const fnKey in impls) (mcp as any)[fnKey] = impls[fnKey]!;
          };
        };

        const revertMock = mockRegistrationFns(
          "registerTool",
          "registerPrompt",
          "registerResource",
          "tool",
          "prompt",
          "resource",
        );

        plugin(ctx, mcp, router);
        api.use("/" + namespace, router);

        revertMock();
      });
    },
  } satisfies DkgPluginBuilderMethods);

/** Expo Router /api/* (except /api/dkg/*) needs an intact req stream for @expo/server. */
const usesExpressBodyParser = (req: express.Request) =>
  !(req.path.startsWith("/api/") && !req.path.startsWith("/api/dkg/"));

export const defaultPlugin = defineDkgPlugin((ctx, mcp, api) => {
  api.use((req, res, next) => {
    if (!usesExpressBodyParser(req)) return next();
    express.json({ limit: "1gb" })(req, res, next);
  });
  api.use((req, res, next) => {
    if (!usesExpressBodyParser(req)) return next();
    express.urlencoded({ limit: "1gb", extended: true })(req, res, next);
  });
  api.use(
    cors({
      allowedHeaders: "*",
      exposedHeaders: "*",
    }),
  );
  api.use(morgan("tiny"));
  api.use(compression());

  api.get("/health", (_, res) => {
    res.status(200).json({ status: "ok" });
  });
});

export const createPluginServer = ({
  name,
  version,
  context,
  plugins,
}: {
  name: string;
  version: string;
  context: DkgContext;
  plugins: DkgPlugin[];
}) => {
  const server = express();
  server.disable("x-powered-by");
  plugins.forEach((plugin) =>
    plugin(context, new McpServer({ name, version }), server),
  );
  registerMcp(server, () => {
    const mcp = new McpServer(
      { name, version },
      { capabilities: { resources: {}, tools: { listChanged: true } } },
    );
    plugins.forEach((plugin) => plugin(context, mcp, express.Router()));
    return mcp;
  });
  return server;
};
