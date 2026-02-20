import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { EpcisValidationService } from "./services/EPCISValidationService";
import { EpcisQueryService } from "./services/EPCISQueryService";
import { formatSourceKAs } from "./utils/sourceKA";
import type { CaptureResponse } from "./model/types";

// Timeout for internal publisher requests (10s for POST, 5s for GET)
const PUBLISHER_POST_TIMEOUT_MS = 10000;
const PUBLISHER_GET_TIMEOUT_MS = 5000;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Helper for delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateRequestId(): string {
  return `epcis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const publisherUrl = process.env.PUBLISHER_URL;

  if (!publisherUrl) {
    throw new Error("PUBLISHER_URL is not set");
  }

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
        parentID: z.string().optional().describe("Parent ID for AggregationEvent queries"),
        childEPC: z.string().optional().describe("Child EPC for AggregationEvent queries"),
        inputEPC: z.string().optional().describe("Input EPC for TransformationEvent queries"),
        outputEPC: z.string().optional().describe("Output EPC for TransformationEvent queries"),
        limit: z.number().optional().describe("Number of results per page (default: 100, max: 1000)"),
        offset: z.number().optional().describe("Number of results to skip for pagination"),
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
          parentID: input.parentID,
          childEPC: input.childEPC,
          inputEPC: input.inputEPC,
          outputEPC: input.outputEPC,
          limit: input.limit,
          offset: input.offset,
        });

        const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");

        const effectiveLimit = Math.min(input.limit ?? 100, 1000);
        const effectiveOffset = input.offset ?? 0;
        const resultData = results?.data || [];
        const resultCount = resultData.length;

        const summary = resultCount
          ? `Found ${resultCount} EPCIS event(s)`
          : "No events found matching the criteria";

        // Build content array with optional source KAs
        const content: { type: "text"; text: string }[] = [
          {
            type: "text",
            text: JSON.stringify({
              summary,
              count: resultCount,
              events: results || [],
              pagination: {
                limit: effectiveLimit,
                offset: effectiveOffset,
              },
            }, null, 2)
          }
        ];

        // Append source Knowledge Assets if available
        const sourceKAs = formatSourceKAs(resultData);
        if (sourceKAs) {
          content.push(sourceKAs);
        }

        return { content };
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

        const resultData = results?.data || [];
        const eventCount = resultData.length;
        let summary = `Tracking: ${input.epc}\n`;
        summary += `Found ${eventCount} event(s) in the supply chain.\n\n`;

        if (eventCount > 0) {
          summary += "Journey Timeline:\n";
          resultData.forEach((event: any, idx: number) => {
            const time = event.eventTime || "Unknown time";
            const step = event.bizStep?.split("-").pop() || event.eventType?.split("/").pop() || "Unknown";
            const location = event.bizLocation || event.readPoint || "Unknown location";
            summary += `${idx + 1}. [${time}] ${step} @ ${location}\n`;
          });
        }

        // Build content array with optional source KAs
        const content: { type: "text"; text: string }[] = [
          {
            type: "text",
            text: JSON.stringify({
              summary,
              epc: input.epc,
              eventCount,
              events: results || [],
            }, null, 2)
          }
        ];

        // Append source Knowledge Assets if available
        const sourceKAs = formatSourceKAs(resultData);
        if (sourceKAs) {
          content.push(sourceKAs);
        }

        return { content };
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
          description: "Capture accepted (202)",
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
        const requestId = generateRequestId();
        console.info(`[EPCIS] Capture request received, requestId: ${requestId}`);

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

          if (!validation.eventCount) {
            return res.status(400).json({
              error: "EPCISDocument contains no events",
              message: "The EPCISDocument contains no events to publish. Please check the document and try again.",
            } as any);
          }

          let result: any;
          try {
            result = await sendToPublisher(
              epcisDocument,
              { source: "EPCIS", sourceId: requestId },
              publishOptions
            );
            console.info(`[EPCIS] Document queued via publisher, requestId: ${requestId}, eventCount: ${validation.eventCount}, captureID: ${result.id}`);
          } catch (error: any) {
            console.error(`[EPCIS] Publishing failed, requestId: ${requestId}, eventCount: ${validation.eventCount}, error:`, error);
            return res.status(500).json({
              error: "Something went wrong with publishing the EPCIS document.",
              message: "Something went wrong with publishing the EPCIS document. Check if the publisher service is available.",
            } as any);
          }

          // Return capture response
          const response: CaptureResponse = {
            status: "202",
            requestId,
            receivedAt: new Date().toISOString(),
            captureID: String(result.id),
            eventCount: validation.eventCount || 0,
            ...(result.ual && { UAL: result.ual }),
          };

          return res.status(202).json(response);
        } catch (error: any) {
          console.error(`[EPCIS] Unexpected error, requestId: ${requestId}, error:`, error);
          return res.status(500).json({
            error: "Something went wrong with processing the EPCIS document.",
            message: "An unexpected error occurred while processing the EPCIS document.",
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
        description: "Check publisher-tracked status by numeric captureID.",
        params: z.object({
          captureID: z.string().openapi({
            description: "Numeric publisher capture ID returned from POST /epcis/capture",
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
        const { captureID } = req.params;
        console.info(`[EPCIS] Capture status request received, captureID: ${captureID}`);

        try {
          const publisherUrl = process.env.PUBLISHER_URL;
          if (!publisherUrl) {
            throw new Error("PUBLISHER_URL is not set");
          }

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
            const errorName = error?.name ?? "UnknownError";
            const errorMessage = error?.message ?? String(error);
            console.error(
              `[EPCIS] [Failed to get publisher status for captureID=${captureID}`,
              { errorName, errorMessage }
            );

            if (error.name === "TimeoutError") {
              return res.status(504).json({
                error: "Publisher timeout",
                captureID,
              } as any);
            }

            throw new Error(`Publisher status request failed: ${errorMessage}`);
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
          fullTrace: z.enum(["true", "false"]).optional().openapi({
            description: "If 'true', search all EPC fields for full supply chain traceability",
            example: "true",
          }),
          parentID: z.string().optional().openapi({
            description: "Filter by parent ID (AggregationEvent)",
            example: "urn:epc:id:sscc:0614141.0000000001",
          }),
          childEPC: z.string().optional().openapi({
            description: "Filter by child EPC (AggregationEvent)",
            example: "urn:epc:id:sgtin:0614141.107346.2017",
          }),
          inputEPC: z.string().optional().openapi({
            description: "Filter by input EPC (TransformationEvent)",
            example: "urn:epc:id:sgtin:0614141.107346.2017",
          }),
          outputEPC: z.string().optional().openapi({
            description: "Filter by output EPC (TransformationEvent)",
            example: "urn:epc:id:sgtin:0614141.099999.9001",
          }),
          limit: z.string().optional().openapi({
            description: "Number of results per page (default: 100, max: 1000)",
            example: "50",
          }),
          offset: z.string().optional().openapi({
            description: "Number of results to skip for pagination",
            example: "0",
          }),
        }),
        response: {
          description: "Query results",
          schema: z.object({
            success: z.boolean(),
            results: z.array(z.any()),
            count: z.number(),
            pagination: z.object({
              limit: z.number(),
              offset: z.number(),
            }),
          }),
        },
      },
      async (req, res) => {
        try {
          const { epc, from, to, bizStep, bizLocation, fullTrace, parentID, childEPC, inputEPC, outputEPC, limit, offset } = req.query;

          // Validate: reject empty string values for filter parameters
          const filters = { epc, from, to, bizStep, bizLocation, parentID, childEPC, inputEPC, outputEPC };
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value === '') {
              return res.status(400).json({
                success: false,
                error: `Parameter '${key}' cannot be empty`,
              } as any);
            }
          }

          // Parse + validate pagination params
          const parsedLimit =
            typeof limit === "string" && limit.length > 0 ? Number.parseInt(limit, 10) : undefined;
          const parsedOffset =
            typeof offset === "string" && offset.length > 0 ? Number.parseInt(offset, 10) : undefined;

          if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000)) {
            return res.status(400).json({
              success: false,
              error: "Parameter 'limit' must be an integer between 1 and 1000",
            } as any);
          }

          if (parsedOffset !== undefined && (!Number.isInteger(parsedOffset) || parsedOffset < 0)) {
            return res.status(400).json({
              success: false,
              error: "Parameter 'offset' must be a non-negative integer",
            } as any);
          }

          // Build the SPARQL query based on parameters
          const sparqlQuery = queryService.buildQuery({
            epc: epc as string,
            from: from as string,
            to: to as string,
            bizStep: bizStep as string,
            bizLocation: bizLocation as string,
            fullTrace: fullTrace === 'true',
            parentID: parentID as string,
            childEPC: childEPC as string,
            inputEPC: inputEPC as string,
            outputEPC: outputEPC as string,
            limit: parsedLimit,
            offset: parsedOffset,
          });

          console.debug("[EPCIS Events] Executing SPARQL query:", sparqlQuery);

          // Execute query against DKG
          const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");

          // Calculate pagination values
          const effectiveLimit = parsedLimit ?? 100;
          const effectiveOffset = parsedOffset ?? 0;
          const resultCount = results?.data?.length || 0;

          res.json({
            success: true,
            results: results?.data || [],
            count: resultCount,
            pagination: {
              limit: effectiveLimit,
              offset: effectiveOffset,
            },
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