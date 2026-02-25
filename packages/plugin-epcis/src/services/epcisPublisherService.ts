const PUBLISHER_POST_TIMEOUT_MS = 10_000;
const PUBLISHER_GET_TIMEOUT_MS = 5_000;
const SEND_TO_PUBLISHER_MAX_RETRIES = 3;
const SEND_TO_PUBLISHER_RETRY_DELAY_MS = 1_000;

type AssetInput = {
  content: object | string;
  metadata?: {
    source?: string;
    sourceId?: string;
    [key: string]: any;
  };
  publishOptions?: {
    privacy?: "private" | "public";
    epochs?: number;
  };
};

type PublisherMetadata = {
  source?: string;
  sourceId?: string;
};

type PublishOptions = {
  privacy?: "private" | "public";
  epochs?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendToPublisher(
  jsonLd: object | string,
  metadata?: PublisherMetadata,
  publishOptions?: PublishOptions,
): Promise<{ id: number; status: string; attemptCount: number; ual?: string }> {
  for (let attempt = 1; attempt <= SEND_TO_PUBLISHER_MAX_RETRIES; attempt++) {
    try {
      const publisherUrl = getPublisherEndpoint();
      const url = `${publisherUrl}/api/dkg/assets`;
      const payload: AssetInput = {
        content: jsonLd,
        metadata: metadata || { source: "EPCIS" },
        publishOptions: {
          privacy: publishOptions?.privacy ?? "private",
          epochs: publishOptions?.epochs ?? 12,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PUBLISHER_POST_TIMEOUT_MS),
      });

      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      ) {
        throw new Error("Publisher not available");
      }

      return await response.json();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[EPCIS] Publisher attempt ${attempt}/${SEND_TO_PUBLISHER_MAX_RETRIES} failed:`,
        message,
      );

      if (attempt < SEND_TO_PUBLISHER_MAX_RETRIES) {
        await delay(
          SEND_TO_PUBLISHER_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
        );
        continue;
      }
    }
  }

  throw new Error("Publisher not available");
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

export async function fetchPublisherCaptureStatus(
  captureID: string,
): Promise<Response> {
  const publisherUrl = getPublisherEndpoint();
  const url = `${publisherUrl}/api/dkg/assets/status/${encodeURIComponent(captureID)}`;
  return fetch(url, { signal: AbortSignal.timeout(PUBLISHER_GET_TIMEOUT_MS) });
}

function getPublisherEndpoint(): string {
  const publisherUrl = process.env.EXPO_PUBLIC_MCP_URL;
  if (!publisherUrl) {
    throw new Error(
      "Publisher endpoint not configured. Set EXPO_PUBLIC_MCP_URL in .env",
    );
  }
  return publisherUrl;
}
