// DKG Explorer URL for source KAs
const DKG_EXPLORER_BASE_URL = "https://dkg.origintrail.io/explore?ual=";

export type SourceKA = {
  title: string;
  issuer: string;
  ual: string;
};

/**
 * Format source Knowledge Assets for MCP tool responses.
 * Extracts unique UALs from query results and formats them as markdown
 * that can be parsed by the chat UI to display KA chips.
 */
export function formatSourceKAs(results: any[]): { type: "text"; text: string } | null {
  const seenUals = new Set<string>();
  const kas: SourceKA[] = [];

  for (const row of results) {
    if (row.ual && !seenUals.has(row.ual)) {
      seenUals.add(row.ual);
      const eventType = row.eventType?.split('/').pop() || 'Event';
      // Clean UAL by removing /private or /public suffix
      const cleanUal = row.ual.replace(/\/(private|public)$/, '');
      kas.push({
        title: `EPCIS ${eventType}`,
        issuer: "EPCIS Plugin",
        ual: cleanUal,
      });
    }
  }

  if (kas.length === 0) return null;

  return {
    type: "text",
    text: "**Source Knowledge Assets:**\n" +
      kas.map(k => `- **${k.title}**: ${k.issuer}\n  [${k.ual}](${DKG_EXPLORER_BASE_URL}${k.ual})`).join("\n"),
  };
}

