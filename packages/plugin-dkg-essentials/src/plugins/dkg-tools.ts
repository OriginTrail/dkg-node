import consumers from "stream/consumers";
import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import {
  CompleteResourceTemplateCallback,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
// @ts-expect-error dkg.js
import { BLOCKCHAIN_IDS } from "dkg.js/constants";
import { getExplorerUrl, validateSparqlQuery } from "../utils";

type SupportedQueryType = "SELECT" | "CONSTRUCT";
type SparqlValidationResult =
  | { valid: true; queryType: SupportedQueryType }
  | { valid: false; error: string };

export default defineDkgPlugin((ctx, mcp, api) => {
  async function publishJsonLdAsset(
    jsonldRaw: string,
    privacy: "private" | "public",
  ): Promise<{ ual: string | null; error: string | null }> {
    try {
      const jsonldParsed = JSON.parse(jsonldRaw);
      const wrapped = { [privacy]: jsonldParsed };
      const createAsset = await ctx.dkg.asset.create(wrapped, {
        epochsNum: 2,
        minimumNumberOfFinalizationConfirmations: 3,
        minimumNumberOfNodeReplications: 1,
      });
      const ual = createAsset?.UAL || null;
      return { ual, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ual: null, error };
    }
  }

  function validateSparqlInput(query: string): SparqlValidationResult {
    const validation = validateSparqlQuery(query);
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error || "Invalid SPARQL query",
      };
    }

    if (!validation.queryType) {
      throw new Error(
        "Internal error: queryType missing after successful validation",
      );
    }

    return {
      valid: true,
      queryType: validation.queryType as SupportedQueryType,
    };
  }

  async function runSparqlQuery(
    query: string,
    queryType: SupportedQueryType,
  ) {
    return ctx.dkg.graph.query(query, queryType);
  }

  function formatSparqlResult(queryResult: unknown, queryType: SupportedQueryType) {
    const isConstructQuery = queryType === "CONSTRUCT";
    const hasDataProperty =
      typeof queryResult === "object" &&
      queryResult !== null &&
      "data" in queryResult;

    if (
      isConstructQuery &&
      hasDataProperty &&
      typeof queryResult.data === "string"
    ) {
      return {
        codeBlockLang: "ntriples",
        resultText: queryResult.data,
      };
    }

    return {
      codeBlockLang: "json",
      resultText: JSON.stringify(queryResult, null, 2),
    };
  }

  async function getAssetByUal(ual: string) {
    return ctx.dkg.asset.get(ual);
  }

  const ualCompleteOptions: Record<string, CompleteResourceTemplateCallback> = {
    blockchainName: (val) =>
      (Object.values(BLOCKCHAIN_IDS) as string[]).reduce<string[]>(
        (acc, id) => {
          const blockchainName = id.split(":")[0]!;
          if (
            blockchainName.includes(val.toLowerCase()) &&
            !acc.includes(blockchainName)
          )
            acc.push(blockchainName);

          return acc;
        },
        [],
      ),
    blockchainId: (val, ctx) =>
      (Object.values(BLOCKCHAIN_IDS) as string[]).reduce<string[]>(
        (acc, id) => {
          const [blockchainName, blockchainId] = id.split(":");
          if (
            blockchainName === ctx?.arguments?.blockchainName &&
            blockchainId!.includes(val)
          )
            acc.push(blockchainId!);

          return acc;
        },
        [],
      ),
  };

  mcp.registerResource(
    "dkg-knowledge-asset",
    new ResourceTemplate(
      "did:dkg:{blockchainName}:{blockchainId}/{blockchainAddress}/{collectionId}/{assetId}",
      {
        list: undefined,
        complete: ualCompleteOptions,
      },
    ),
    {
      title: "DKG Knowledge Asset",
      description:
        "A resource for accessing Knowledge Assets on OriginTrail Decentralized Knowledge Graph (DKG).",
    },
    async (ual) => {
      const getAssetResult = await ctx.dkg.asset.get(ual.href.toLowerCase(), {
        includeMetadata: true,
      });
      return {
        contents: [
          { uri: ual.href, text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

  mcp.registerResource(
    "dkg-knowledge-collection",
    new ResourceTemplate(
      "did:dkg:{blockchainName}:{blockchainId}/{blockchainAddress}/{collectionId}",
      {
        list: undefined,
        complete: ualCompleteOptions,
      },
    ),
    {
      title: "DKG Knowledge Collection",
      description:
        "A resource for accessing Knowledge Collections on OriginTrail Decentralized Knowledge Graph (DKG).",
    },
    async (ual) => {
      const getAssetResult = await ctx.dkg.asset.get(ual.href.toLowerCase(), {
        includeMetadata: true,
      });
      return {
        contents: [
          { uri: ual.href, text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

  mcp.registerTool(
    "dkg-create",
    {
      title: "DKG Knowledge Asset create tool",
      description:
        "A tool for creating and publishing Knowledge Assets on OriginTrail Decentralized Knowledge Graph (DKG), " +
        "taking either a single JSON-LD string or a single file id as input. " +
        "Optionally, you can specify privacy as 'private' or 'public' (default: 'private').",
      inputSchema: {
        jsonld: z
          .string()
          .describe("JSON-LD content or ID of an uploaded file"),
        privacy: z.enum(["private", "public"]).optional().default("private"),
      },
    },
    async (input) => {
      if (!input.jsonld) {
        console.error("No JSON-LD content provided after file read.");
        throw new Error("No JSON-LD content provided.");
      }
      const privacy = input.privacy || "private";
      const content =
        input.jsonld.startsWith("{") || input.jsonld.startsWith("[")
          ? input.jsonld
          : await ctx.blob.get(input.jsonld).then((r) => {
              if (!r) {
                console.error(`File with id "${input.jsonld}" not found`);
                throw new Error(`File with id "${input.jsonld}" not found`);
              }
              return consumers.text(r.data);
            });

      const { ual, error } = await publishJsonLdAsset(content, privacy);
      if (error) {
        console.error("Error creating asset:", error);
        throw new Error("Failed to create asset: " + error);
      }

      const explorerLink = getExplorerUrl(ual!);
      const response = `Knowledge Asset collection successfully created.\n\nUAL: ${ual}\nDKG Explorer link: ${explorerLink}`;
      console.log("Formatted response:", response);
      return {
        content: [{ type: "text", text: response }],
      };
    },
  );

  mcp.registerTool(
    "dkg-sparql-query",
    {
      title: "DKG SPARQL Query Tool",
      description:
        "Execute SPARQL queries on the OriginTrail Decentralized Knowledge Graph (DKG). " +
        "Takes a SPARQL query as input and returns the query results from the DKG. " +
        "Supports SELECT and CONSTRUCT queries.",
      inputSchema: {
        query: z
          .string()
          .describe("SPARQL query to execute on the DKG (SELECT or CONSTRUCT)"),
      },
    },
    async ({ query }) => {
      const validation = validateSparqlInput(query);
      if (!validation.valid) {
        console.error("Invalid SPARQL query:", validation.error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Invalid SPARQL query: ${validation.error}\n\nPlease check your query syntax and try again.`,
            },
          ],
        };
      }

      try {
        console.log(`Executing SPARQL ${validation.queryType} query...`);
        const queryResult = await runSparqlQuery(query, validation.queryType);
        const { codeBlockLang, resultText } = formatSparqlResult(
          queryResult,
          validation.queryType,
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Query executed successfully\n\n**Results:**\n\`\`\`${codeBlockLang}\n${resultText}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error executing SPARQL query:", errorMessage);

        return {
          content: [
            {
              type: "text",
              text: `❌ Error executing SPARQL query:\n\n${errorMessage}\n\nPlease check your query and try again.`,
            },
          ],
        };
      }
    },
  );

  mcp.registerTool(
    "dkg-get",
    {
      title: "DKG Knowledge Asset get tool",
      description:
        "Retrieve a specific Knowledge Asset from the DKG by its UAL (Unique Asset Locator). ",
      inputSchema: {
        ual: z
          .string()
          .describe(
            "The UAL (Unique Asset Locator) in format: did:dkg:{blockchainName}:{blockchainId}/{blockchainAddress}/{collectionId}/{assetId} or did:dkg:{blockchainName}:{blockchainId}/{blockchainAddress}/{collectionId}",
          ),
      },
    },
    async ({ ual }) => {
      const getAssetResult = await getAssetByUal(ual);
      return {
        content: [
          { type: "text", text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

  api.post(
    "/api/dkg/query",
    openAPIRoute(
      {
        tag: "DKG Retrieval",
        summary: "Execute SPARQL Query",
        description: "Execute a SPARQL query on the DKG network",
        body: z.object({
          query: z.string().min(1, "Query cannot be empty"),
          queryType: z
            .enum(["SELECT", "CONSTRUCT"])
            .optional()
            .default("SELECT"),
          validate: z.boolean().optional().default(true),
        }),
        response: {
          schema: z.object({
            success: z.boolean(),
            data: z.any().optional(),
            error: z.string().optional(),
            validation: z
              .object({
                valid: z.boolean(),
                error: z.string().optional(),
              })
              .optional(),
          }),
        },
        finalizeRouteConfig: (config) => ({
          ...config,
          security: [],
        }),
      },
      async (req, res) => {
        try {
          let queryType: SupportedQueryType;
          if (req.body.validate !== false) {
            const validation = validateSparqlInput(req.body.query);
            if (!validation.valid) {
              return res.status(400).json({
                success: false,
                error: validation.error,
                validation: {
                  valid: false,
                  error: validation.error,
                },
              });
            }
            queryType = validation.queryType;
          } else {
            queryType = req.body.queryType || "SELECT";
          }

          const queryResult = await runSparqlQuery(req.body.query, queryType);
          return res.json({
            success: true,
            data: queryResult,
          });
        } catch (error: any) {
          return res.status(500).json({
            success: false,
            error: error.message,
          });
        }
      },
    ),
  );

  api.get(
    "/api/dkg/get",
    openAPIRoute(
      {
        tag: "DKG Retrieval",
        summary: "Get DKG Asset",
        description: "Retrieve an asset from DKG by UAL",
        query: z.object({
          ual: z.string(),
        }),
        response: {
          schema: z.object({
            success: z.boolean(),
            data: z.any().optional(),
            error: z.string().optional(),
          }),
        },
        finalizeRouteConfig: (config) => ({
          ...config,
          security: [],
        }),
      },
      async (req, res) => {
        try {
          const asset = await getAssetByUal(req.query.ual);
          return res.json({
            success: true,
            data: asset,
          });
        } catch (error: any) {
          return res.status(500).json({
            success: false,
            error: error.message,
          });
        }
      },
    ),
  );
});
