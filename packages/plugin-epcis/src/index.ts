import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { EpcisValidationService } from "./services/EPCISValidationService";
import { EpcisQueryService } from "./services/EPCISQueryService";
import type { CaptureResponse } from "./model/types";

// Timeout for internal publisher requests (30s for POST, 5s for GET)
const PUBLISHER_POST_TIMEOUT_MS = 10000;
const PUBLISHER_GET_TIMEOUT_MS = 5000;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper for delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to send JSON-LD to publisher with retries
async function sendToPublisher(
  jsonLd: any,
  metadata?: { source?: string; sourceId?: string },
  publishOptions?: {
    privacy?: "private" | "public";
    epochs?: number;
  }
): Promise<{ id: number; status: string; attemptCount: number }> {
  const publisherUrl = process.env.PUBLISHER_URL || "http://localhost:9200";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${publisherUrl}/api/dkg/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: jsonLd,
          metadata: metadata || { source: "EPCIS" },
          publishOptions: {
            privacy: publishOptions?.privacy ?? "private",
            epochs: publishOptions?.epochs ?? 12,
          },
        }),
        signal: AbortSignal.timeout(PUBLISHER_POST_TIMEOUT_MS),
      });

      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Publisher not available");
      }

      return await response.json();
    } catch (error: any) {
      console.warn(`[EPCIS] Publisher attempt ${attempt}/${MAX_RETRIES} failed`);

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        continue;
      }
    }
  }

  throw new Error("Publisher not available");
}

// Fallback: publish directly to DKG
async function publishDirectToDKG(
  ctx: any,
  jsonLd: any,
  publishOptions?: { privacy?: "private" | "public"; epochs?: number }
): Promise<{ ual: string }> {
  const privacy = publishOptions?.privacy ?? "private";
  const wrapped = { [privacy]: jsonLd };

  console.log(`[EPCIS] Publishing directly to DKG (fallback)...`);

  const result = await ctx.dkg.asset.create(wrapped, {
    epochsNum: publishOptions?.epochs ?? 12,
    minimumNumberOfFinalizationConfirmations: 3,
    minimumNumberOfNodeReplications: 1,
  });

  if (!result?.UAL) {
    throw new Error("DKG publish failed - no UAL returned");
  }

  return { ual: result.UAL };
}

export default defineDkgPlugin((ctx, mcp, api) => {

  const validationService = new EpcisValidationService();
  const queryService = new EpcisQueryService();

  console.log("🚀 EPCIS Plugin loaded");

  // MCP Tool: Query EPCIS events from DKG
  mcp.registerTool(
    "epcis-query",
    {
      title: "Query EPCIS Events",
      description:
        "Query EPCIS supply chain events from the OriginTrail DKG. " +
        "Can filter by EPC (product identifier), from date to date, business step, or location. " +
        "Use fullTrace=true to search across all event types (transformations, aggregations) for complete supply chain traceability.",
      inputSchema: {
        epc: z.string().optional().describe("EPC identifier (e.g., urn:epc:id:sgtin:0614141.107346.2017)"),
        from: z.string().optional().describe("Query events from this date onwards, requires it to follow ISO 8601 format (e.g., 2024-01-01T00:00:00Z)"),
        to: z.string().optional().describe("Query events up to this date, requires it to follow ISO 8601 format (e.g., 2024-01-01T00:00:00Z)"),
        bizStep: z.string().optional().describe("Business step (e.g., 'receiving', 'shipping', 'assembling')"),
        bizLocation: z.string().optional().describe("Business location URI"),
        fullTrace: z.boolean().optional().describe("If true, search all EPC fields for full traceability"),
      },
    },
    async (input) => {
      try {
        const sparqlQuery = queryService.buildQuery({
          epc: input.epc,
          from: input.from,
          to: input.to,
          bizStep: input.bizStep,
          bizLocation: input.bizLocation,
          fullTrace: input.fullTrace,
        });

        const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");

        const summary = results?.length
          ? `Found ${results.length} EPCIS event(s)`
          : "No events found matching the criteria";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary,
                count: results?.data.length || 0,
                events: results || [],
              }, null, 2)
            }
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Query failed",
              }, null, 2)
            }
          ],
          isError: true,
        };
      }
    }
  );

  // MCP Tool: Track item journey (full traceability)
  mcp.registerTool(
    "epcis-track-item",
    {
      title: "Track Item Journey",
      description:
        "Track a single item's complete journey through the supply chain. " +
        "Finds all events where this EPC appears - as observed item, transformation input/output, or in aggregations. " +
        "Returns events in chronological order showing the item's full lifecycle.",
      inputSchema: {
        epc: z.string().describe("The EPC to track (e.g., urn:epc:id:sgtin:0614141.107346.2017)"),
      },
    },
    async (input) => {
      try {
        const sparqlQuery = queryService.buildQuery({
          epc: input.epc,
          fullTrace: true,  // Always use full traceability for item tracking
        });

        const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");

        const eventCount = results?.length || 0;
        let summary = `Tracking: ${input.epc}\n`;
        summary += `Found ${eventCount} event(s) in the supply chain.\n\n`;

        if (eventCount > 0) {
          summary += "Journey Timeline:\n";
          results.forEach((event: any, idx: number) => {
            const time = event.eventTime || "Unknown time";
            const step = event.bizStep?.split("-").pop() || event.eventType?.split("/").pop() || "Unknown";
            const location = event.bizLocation || event.readPoint || "Unknown location";
            summary += `${idx + 1}. [${time}] ${step} @ ${location}\n`;
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary,
                epc: input.epc,
                eventCount,
                events: results || [],
              }, null, 2)
            }
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Tracking failed",
              }, null, 2)
            }
          ],
          isError: true,
        };
      }
    }
  );

  // POST /epcis/capture - Accept EPCISDocument and queue for publishing
  api.post(
    "/epcis/capture",
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Capture EPCIS Document",
        description: "Accept an EPCISDocument and queue it for publishing to DKG",
        body: z.object({
          epcisDocument: z.object({}).passthrough().openapi({
            description: "The EPCISDocument (JSON-LD)",
          }),
          publishOptions: z.object({
            privacy: z.enum(["private", "public"]).optional().openapi({
              description: "Asset visibility (default: private)",
            }),
            epochs: z.number().min(1).optional().openapi({
              description: "Number of epochs to publish for (default: 12)",
            }),
          }).optional().openapi({
            description: "Publishing options (all optional with sensible defaults)",
          }),
        }),
        response: {
          description: "Capture accepted (202) or published directly (201)",
          schema: z.object({
            status: z.string(),
            receivedAt: z.string(),
            captureID: z.string(),
            eventCount: z.number(),
            UAL: z.string().optional(),
          }),
        },
      },
      async (req, res) => {
        try {
          const { epcisDocument, publishOptions } = req.body;

          // Validate the EPCIS document
          const validation = validationService.validate(epcisDocument);

          if (!validation.valid) {
            return res.status(400).json({
              error: "Invalid EPCISDocument",
              details: validation.errors,
            } as any);
          }

          // Generate request ID for tracing
          const requestId = `epcis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          console.log(`[EPCIS] [${requestId}] Capture request received, ${validation.eventCount} event(s)`);

          let result: any;
          let usedFallback = false;

          // Try publisher first (with retries)
          try {
            result = await sendToPublisher(
              epcisDocument,
              { source: "EPCIS", sourceId: requestId },
              publishOptions
            );
            console.log(`[EPCIS] [${requestId}] Queued via publisher, captureID: ${result.id}`);
          } catch (publisherError: any) {
            console.warn(`[EPCIS] [${requestId}] Publisher not available, trying direct DKG fallback`);

            // Fallback to direct DKG publish
            try {
              const directResult = await publishDirectToDKG(ctx, epcisDocument, publishOptions);
              result = { id: `direct-${Date.now()}`, ual: directResult.ual };
              usedFallback = true;
              console.log(`[EPCIS] [${requestId}] Published directly to DKG, UAL: ${result.ual}`);
            } catch (fallbackError: any) {
              console.error(`[EPCIS] [${requestId}] Both publisher and DKG fallback failed`);
              return res.status(503).json({
                error: "Publishing unavailable",
                message: "Both publisher service and direct DKG publishing failed",
                requestId
              } as any);
            }
          }

          // Return capture response
          const response: CaptureResponse = {
            status: usedFallback ? "201" : "202",
            receivedAt: new Date().toISOString(),
            captureID: String(result.id),
            eventCount: validation.eventCount || 0,
            ...(result.ual && { UAL: result.ual }),
          };

          res.status(usedFallback ? 201 : 202).json(response);
        } catch (error: any) {
          console.error("[EPCIS Capture] Unexpected error:", error);
          res.status(500).json({
            error: "Internal server error",
            message: "An unexpected error occurred while processing the capture",
          } as any);
        }
      }
    )
  );

  // GET /epcis/capture/:captureID - Check capture status
  api.get(
    "/epcis/capture/:captureID",
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Get Capture Status",
        description: "Check the status of an EPCIS capture by captureID",
        params: z.object({
          captureID: z.string().openapi({
            description: "The capture ID returned from POST /epcis/capture",
            example: "123",
          }),
        }),
        response: {
          description: "Capture status",
          schema: z.object({
            status: z.string(),
            captureID: z.string(),
            UAL: z.string().optional(),
            publishedAt: z.string().optional(),
            error: z.string().optional(),
          }),
        },
      },
      async (req, res) => {
        try {
          const { captureID } = req.params;
          const publisherUrl = process.env.PUBLISHER_URL || "http://localhost:9200";

          const captureIdPattern = /^[0-9]{1,20}$/;
          if (!captureIdPattern.test(captureID)) {
            return res.status(400).json({
              error: "Invalid captureID format",
              captureID,
            } as any);
          }
          // Query publisher for asset status
          let response: Response;
          try {
            response = await fetch(
              `${publisherUrl}/api/dkg/assets/status/${encodeURIComponent(captureID)}`,
              { signal: AbortSignal.timeout(PUBLISHER_GET_TIMEOUT_MS) }
            );
          } catch (error: any) {
            if (error.name === "TimeoutError") {
              return res.status(504).json({
                error: "Publisher timeout",
                captureID,
              } as any);
            }
            throw error;
          }

          if (!response.ok) {
            if (response.status === 404) {
              return res.status(404).json({ error: "Capture not found", captureID } as any);
            }
            throw new Error("Failed to fetch capture status");
          }

          const asset = await response.json();

          // Map publisher status to EPCIS response
          const result: any = {
            status: asset.status,
            captureID,
          };

          if (asset.ual) result.UAL = asset.ual;
          if (asset.publishedAt) result.publishedAt = asset.publishedAt;
          if (asset.lastError) result.error = asset.lastError;

          res.json(result);
        } catch (error: any) {
          console.error("[EPCIS Status] Error:", error);
          res.status(500).json({
            error: "Failed to get capture status",
          } as any);
        }
      }
    )
  );

  // GET /epcis/events - Query EPCIS events from DKG
  api.get(
    "/epcis/events",
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Query EPCIS Events",
        description: "Query EPCIS events from DKG using various filters",
        query: z.object({
          epc: z.string().optional().openapi({
            description: "Filter by EPC (product identifier)",
            example: "urn:epc:id:sgtin:0614141.107346.2017",
          }),
          from: z.string().datetime({ message: "Must be ISO 8601 format (e.g., 2024-01-01T00:00:00Z)" }).optional().openapi({
            description: "Start of time range (ISO 8601)",
            example: "2024-01-01T00:00:00Z",
          }),
          to: z.string().datetime({ message: "Must be ISO 8601 format (e.g., 2024-12-31T23:59:59Z)" }).optional().openapi({
            description: "End of time range (ISO 8601)",
            example: "2024-12-31T23:59:59Z",
          }),
          bizStep: z.string().optional().openapi({
            description: "Filter by business step URI",
            example: "https://ref.gs1.org/cbv/BizStep-assembling",
          }),
          bizLocation: z.string().optional().openapi({
            description: "Filter by business location",
            example: "urn:epc:id:sgln:0614141.00001.0",
          }),
          fullTrace: z.string().optional().openapi({
            description: "If 'true', search all EPC fields (epcList, inputEPCList, outputEPCList, childEPCs, parentID) for full supply chain traceability",
            example: "true",
          }),
        }),
        response: {
          description: "Query results",
          schema: z.object({
            success: z.boolean(),
            query: z.string().optional(),
            results: z.array(z.any()),
            count: z.number(),
          }),
        },
      },
      async (req, res) => {
        try {
          const { epc, from, to, bizStep, bizLocation, /*ual,*/ fullTrace } = req.query;

          // Build the SPARQL query based on parameters
          const sparqlQuery = queryService.buildQuery({
            epc: epc as string,
            from: from as string,
            to: to as string,
            bizStep: bizStep as string,
            bizLocation: bizLocation as string,
            fullTrace: fullTrace === 'true',
          });

          console.log("[EPCIS Events] Executing SPARQL query:", sparqlQuery);

          // Execute query against DKG
          const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");

          res.json({
            success: true,
            //query: sparqlQuery,
            results: results || [],
            count: results?.length || 0,
          });
        } catch (error: any) {
          console.error("[EPCIS Events] Query error:", error);
          res.status(500).json({
            success: false,
            error: "Failed to query events",
          } as any);
        }
      }
    )
  );

  // GET /epcis/asset/:ual - Retrieve EPCIS document by UAL
  api.get(
    "/epcis/asset/*ual",
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Get EPCIS Document by UAL",
        description: "Retrieve a complete EPCIS document from DKG by its UAL",
        params: z.object({
          ual: z.union([z.string(), z.array(z.string())]).openapi({
            description: "The UAL of the published EPCIS document",
            example: "did:dkg:otp:2043/0x1234.../123456",
          }),
        }),
        response: {
          description: "EPCIS document content",
          schema: z.object({
            success: z.boolean(),
            ual: z.string(),
            data: z.any(),
          }),
        },
      },
      async (req, res) => {
        try {
          const ual = Array.isArray(req.params.ual)
            ? req.params.ual.join('/')
            : req.params.ual;

          if (!ual.startsWith("did:dkg:")) {
            return res.status(400).json({
              success: false,
              error: "Invalid UAL format",
            } as any);
          }

          const assetResult = await ctx.dkg.asset.get(ual, {
            contentType: "all",
          });

          res.json({
            success: true,
            ual,
            data: assetResult,
          });
        } catch (error: any) {
          console.error("[EPCIS Asset] Get error:", error);
          res.status(404).json({
            success: false,
            error: "Asset not found",
          } as any);
        }
      }
    )
  );
});