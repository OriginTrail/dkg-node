/**
 * Helper function to format asset status information
 */
export interface FormatAssetStatusOptions {
  asset: any;
  contentId?: string;
  includeHeader?: boolean;
  numbered?: boolean;
  index?: number;
}

export function formatAssetStatus(options: FormatAssetStatusOptions): string {
  const { asset, contentId, includeHeader = false, numbered = false, index } = options;
  let text = "";

  if (includeHeader) {
    text += `**Asset Status**: ${asset.status.toUpperCase()}\n\n`;
  }

  if (numbered && index !== undefined) {
    text += `**${index}. Asset ID ${asset.id}**\n`;
  } else {
    text += `**Asset ID**: ${asset.id}\n`;
  }

  if (contentId) {
    text += numbered ? `   Content ID: ${contentId}\n` : `**Content ID**: ${contentId}\n`;
  }

  if (!includeHeader && !numbered) {
    // For single asset status view
    if (asset.ual) {
      text += `\n**Published!**\n`;
      text += `**UAL**: ${asset.ual}\n`;
      if (asset.transactionHash) {
        text += `**Transaction**: ${asset.transactionHash}\n`;
      }
      if (asset.publishedAt) {
        text += `**Published At**: ${asset.publishedAt}\n`;
      }
    } else if (asset.status === "failed") {
      text += `\n**Publishing Failed**\n`;
      if (asset.lastError) {
        text += `**Error**: ${asset.lastError}\n`;
      }
      text += `**Attempts**: ${asset.attemptCount}\n`;
    } else if (asset.status === "publishing") {
      text += `\n**Currently Publishing...**\n`;
      text += `Please check again in a moment.\n`;
    } else {
      text += `\n**Status**: ${asset.status.toUpperCase()}\n`;
    }
  } else {
    // For list views
    if (!numbered) {
      text += `   Status: ${asset.status.toUpperCase()}\n`;
    } else {
      text += `   Status: ${asset.status.toUpperCase()}\n`;
    }

    if (asset.ual) {
      text += numbered ? `   UAL: ${asset.ual}\n` : `**UAL**: ${asset.ual}\n`;
    }

    if (asset.lastError && asset.status === "failed") {
      text += numbered
        ? `   Error: ${asset.lastError.substring(0, 100)}...\n`
        : `**Error**: ${asset.lastError}\n`;
    }

    if (asset.publishedAt) {
      text += numbered ? `   Published: ${asset.publishedAt}\n` : `**Published**: ${asset.publishedAt}\n`;
    }
  }

  return text;
}
