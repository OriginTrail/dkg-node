import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import { EpcisValidationService } from "./services/EPCISValidationService";
import { EpcisQueryService } from "./services/EPCISQueryService";
import type { CaptureResponse } from "./model/types";

// Helper function to send JSON-LD to publisher
async function sendToPublisher(
  jsonLd: any,
  metadata?: { source?: string; sourceId?: string }
): Promise<{ id: number; status: string; attemptCount: number }> {
  const publisherUrl = process.env.PUBLISHER_URL || "http://localhost:9200";

  const response = await fetch(`${publisherUrl}/api/dkg/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: jsonLd,
      metadata: metadata || { source: "EPCIS" },
      publishOptions: {
        privacy: "private",
        epochs: 2,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Publisher request failed");
  }

  return response.json();
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
        "Can filter by EPC (product identifier), time range, business step, or location. " +
        "Use fullTrace=true to search across all event types (transformations, aggregations) for complete supply chain traceability.",
      inputSchema: {
        epc: z.string().optional().describe("EPC identifier (e.g., urn:epc:id:sgtin:0614141.107346.2017)"),
        from: z.string().optional().describe("Start of time range (ISO 8601, e.g., 2024-01-01T00:00:00Z)"),
        to: z.string().optional().describe("End of time range (ISO 8601)"),
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
                count: results?.length || 0,
                events: results || [],
                query: sparqlQuery,
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
                message: error.message,
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
                message: error.message,
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
        body: z.object({}).passthrough().openapi({
          description: "EPCISDocument (JSON-LD)",
        }),
        response: {
          description: "Capture accepted",
          schema: z.object({
            status: z.string(),
            receivedAt: z.string(),
            captureID: z.string(),
            eventCount: z.number(),
          }),
        },
      },
      async (req, res) => {
        try {
          const document = req.body;

          // Validate the EPCIS document

          const validation = validationService.validate(document);

          if (!validation.valid) {
            return res.status(400).json({
              error: "Invalid EPCISDocument",
              details: validation.errors,
            } as any);
          }

          // Send to publisher
          const result = await sendToPublisher(document, {
            source: "EPCIS",
            sourceId: `epcis-${Date.now()}`,
          });

          // Return capture response
          const response: CaptureResponse = {
            status: "202",
            receivedAt: new Date().toISOString(),
            captureID: String(result.id),
            eventCount: validation.eventCount || 0,
          };

          res.status(202).json(response);
        } catch (error: any) {
          console.error("[EPCIS Capture] Error:", error);
          res.status(500).json({
            error: "Failed to process capture",
            message: error.message,
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

          const captureIdPattern = /^[0-9]+$/;
          if (!captureIdPattern.test(captureID)) {
            return res.status(400).json({
              error: "Invalid captureID format",
              captureID,
            } as any);
          }
          // Query publisher for asset status
          const response = await fetch(`${publisherUrl}/api/dkg/assets/status/${encodeURIComponent(captureID)}`);

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
            message: error.message,
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
          from: z.string().optional().openapi({
            description: "Start of time range (ISO 8601)",
            example: "2024-01-01T00:00:00Z",
          }),
          to: z.string().optional().openapi({
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
          ual: z.string().optional().openapi({
            description: "Get event by specific UAL",
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
          const { epc, from, to, bizStep, bizLocation, ual, fullTrace } = req.query;

          // Build the SPARQL query based on parameters
          const sparqlQuery = queryService.buildQuery({
            epc: epc as string,
            from: from as string,
            to: to as string,
            bizStep: bizStep as string,
            bizLocation: bizLocation as string,
            ual: ual as string,
            fullTrace: fullTrace === 'true',
          });

          console.log("[EPCIS Events] Executing SPARQL query:", sparqlQuery);

          // Execute query against DKG
          const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");

          res.json({
            success: true,
            query: sparqlQuery,
            results: results || [],
            count: results?.length || 0,
          });
        } catch (error: any) {
          console.error("[EPCIS Events] Query error:", error);
          res.status(500).json({
            success: false,
            error: "Failed to query events",
            message: error.message,
          } as any);
        }
      }
    )
  );
  
});