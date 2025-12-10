import consumers from "stream/consumers";
import { defineDkgPlugin } from "@dkg/plugins";
import { z } from "@dkg/plugins/helpers";
import {
  CompleteResourceTemplateCallback,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
// @ts-expect-error dkg.js
import { BLOCKCHAIN_IDS } from "dkg.js/constants";
import { getExplorerUrl, validateSparqlQuery } from "../utils";

export default defineDkgPlugin((ctx, mcp) => {
  
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
      // Validate query syntax
      const validation = validateSparqlQuery(query);

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

      // Use validated query type
      const queryType = validation.queryType || "SELECT";

      try {
        console.log(`Executing SPARQL ${queryType} query...`);
        const queryResult = await ctx.dkg.graph.query(query, queryType);

        const resultText = JSON.stringify(queryResult, null, 2);

        return {
          content: [
            {
              type: "text",
              text: `✅ Query executed successfully\n\n**Results:**\n\`\`\`json\n${resultText}\n\`\`\``,
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
        "A tool for running a GET operation on OriginTrail Decentralized Knowledge Graph (DKG) and retrieving a specific Knowledge Asset by its UAL (Unique Asset Locator), taking the UAL as input.",
      inputSchema: { ual: z.string() },
    },
    async ({ ual }) => {
      const getAssetResult = await ctx.dkg.asset.get(ual);
      return {
        content: [
          { type: "text", text: JSON.stringify(getAssetResult, null, 2) },
        ],
      };
    },
  );

});
