import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Parser } from "sparqljs";

export type SourceKA = {
  title: string;
  issuer: string;
  ual: string;
};

const DKG_EXPLORER_BASE_URL = "https://dkg-testnet.origintrail.io/explore?ual=";

export const getExplorerUrl = (ual: string) => {
  return `${DKG_EXPLORER_BASE_URL}${ual}`;
};

export const serializeSourceKAContent = (
  kas: SourceKA[],
): CallToolResult["content"][number] => ({
  type: "text",
  text:
    "**Source Knowledge Assets:**\n" +
    kas
      .map(
        (k) =>
          `- **${k.title}**: ${k.issuer}
  [${k.ual}](${getExplorerUrl(k.ual)})`,
      )
      .join("\n"),
  _meta: {
  description:
    "This section provides a list of source knowledge assets used in the creation of this content." +
    "This data should be included in the final output.",
  },
});

export const parseSourceKAContent = (
  content: CallToolResult["content"][number],
) => {
  if (content.type !== "text") return null;

  const regex = /- \*\*(.*?)\*\*: (.*?)\n\s+\[(.*?)\]\((.*?)\)/g;
  const matches = content.text.matchAll(regex);
  const kas: SourceKA[] = [];

  for (const match of matches) {
    const [, title, issuer, ual] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    kas.push({ title, issuer, ual });
  }

  return kas.length > 0 ? kas : null;
};

export const withSourceKnowledgeAssets = <T extends CallToolResult>(
  data: T,
  kas: SourceKA[],
) => ({
  ...data,
  content: [...data.content, serializeSourceKAContent(kas)],
});

// SPARQL query validation
// Reuse parser instance for better performance
const sparqlParser = new Parser();

export function validateSparqlQuery(query: string): { valid: boolean; error?: string; queryType?: string } {
  try {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { valid: false, error: "Query cannot be empty" };
    }

    // Use sparqljs parser for proper syntax validation
    const parsed = sparqlParser.parse(trimmedQuery);

    // Check if it's a query (not an update)
    if (parsed.type !== "query") {
      return {
        valid: false,
        error: "Only SPARQL queries are allowed, not updates (INSERT, DELETE, MODIFY)",
      };
    }

    // Only allow query types supported by the DKG node
    const allowedQueryTypes = ["SELECT", "CONSTRUCT"];
    if (!allowedQueryTypes.includes(parsed.queryType)) {
      return {
        valid: false,
        error: `Only SELECT and CONSTRUCT queries are supported. Received: ${parsed.queryType}`,
      };
    }

    return { valid: true, queryType: parsed.queryType };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: `Invalid SPARQL syntax: ${errorMessage}`,
    };
  }
}
