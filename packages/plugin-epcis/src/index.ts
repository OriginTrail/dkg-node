import { defineDkgPlugin } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import type { EpcisQueryParams, ValidationResult } from "./model/types";
import { EpcisQueryService } from "./services/EPCISQueryService";
import {
  fetchPublisherCaptureStatus,
  isTimeoutError,
  sendToPublisher,
} from "./services/EPCISPublisherService";
import { EpcisValidationService } from "./services/EPCISValidationService";
import {
  hasAtLeastOneEpcisFilter,
  hasValidEpcisDateRange,
  optionalDateTimeQueryString,
  optionalIntegerInputParam,
  optionalIntegerQueryParam,
  optionalNonEmptyQueryString,
  requiredNonEmptyString,
} from "./utils/EPCISQueryValidation";
import { formatSourceKAs } from "./utils/sourceKA";

const QUERY_LIMIT = {
  MIN: 1,
  MAX: 1000,
  DEFAULT: 100,
};

const QUERY_OFFSET = {
  MIN: 0,
  DEFAULT: 0,
};

const QUERY_LIMIT_ERROR = `Parameter 'limit' must be an integer between ${QUERY_LIMIT.MIN} and ${QUERY_LIMIT.MAX}`;
const QUERY_OFFSET_ERROR = `Parameter 'offset' must be an integer bigger than ${QUERY_OFFSET.MIN}`;
const CAPTURE_ID_PATTERN = /^[0-9]{1,20}$/;

type CaptureResponse = {
  status: string;
  requestId: string;
  receivedAt: string;
  captureID: string;
  eventCount: number;
  UAL?: string;
};

type PublisherCaptureStatusResponse = {
  status: string;
  ual?: string;
  publishedAt?: string;
  lastError?: string;
};

function generateRequestId(): string {
  return `epcis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTrackItemSummary(epc: string, events: any[]): string {
  const eventCount = events.length;
  let summary = `Tracking: ${epc}\n`;
  summary += `Found ${eventCount} event(s) in the supply chain.\n\n`;

  if (eventCount === 0) {
    return summary;
  }

  summary += "Journey Timeline:\n";
  events.forEach((event: any, idx: number) => {
    const time = event.eventTime || "Unknown time";
    const step =
      event.bizStep?.split("-").pop() ||
      event.eventType?.split("/").pop() ||
      "Unknown";
    const location = event.bizLocation || event.readPoint || "Unknown location";
    summary += `${idx + 1}. [${time}] ${step} @ ${location}\n`;
  });

  return summary;
}

function getCaptureValidationError(
  validation: ValidationResult,
): { error: string; details?: string[]; message?: string } | null {
  if (!validation.valid) {
    return {
      error: "Invalid EPCISDocument",
      details: validation.errors,
    };
  }

  if ((validation.eventCount ?? 0) < 1) {
    return {
      error: "EPCISDocument contains no events",
      message:
        "The EPCISDocument contains no events to publish. Please check the document and try again.",
    };
  }

  return null;
}

export default defineDkgPlugin((ctx, mcp, api) => {
  const validationService = new EpcisValidationService();
  const queryService = new EpcisQueryService();

  async function executeEpcisEventsQuery(queryParams: EpcisQueryParams) {
    const sparqlQuery = queryService.buildQuery(queryParams);
    console.debug("[EPCIS] Executing SPARQL query:", sparqlQuery);

    const results = await ctx.dkg.graph.query(sparqlQuery, "SELECT");
    const resultData = results?.data ?? [];

    return {
      results,
      resultData,
      resultCount: resultData.length,
      pagination: {
        limit: Math.min(
          queryParams.limit ?? QUERY_LIMIT.DEFAULT,
          QUERY_LIMIT.MAX,
        ),
        offset: queryParams.offset ?? QUERY_OFFSET.DEFAULT,
      },
    };
  }

  console.info("[EPCIS] Plugin loaded");

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
        epc: optionalNonEmptyQueryString("epc").describe(
          "EPC identifier (e.g., urn:epc:id:sgtin:0614141.107346.2017)",
        ),
        from: optionalDateTimeQueryString("from").describe(
          "Query events from this date onwards, requires it to follow ISO 8601 format (e.g., 2024-01-01T00:00:00Z)",
        ),
        to: optionalDateTimeQueryString("to").describe(
          "Query events up to this date, requires it to follow ISO 8601 format (e.g., 2024-01-01T00:00:00Z)",
        ),
        bizStep: optionalNonEmptyQueryString("bizStep").describe(
          "Business step (e.g., 'receiving', 'shipping', 'assembling')",
        ),
        bizLocation: optionalNonEmptyQueryString("bizLocation").describe(
          "Business location URI",
        ),
        fullTrace: z
          .boolean()
          .optional()
          .describe("If true, search all EPC fields for full traceability"),
        parentID: optionalNonEmptyQueryString("parentID").describe(
          "Parent ID for AggregationEvent queries",
        ),
        childEPC: optionalNonEmptyQueryString("childEPC").describe(
          "Child EPC for AggregationEvent queries",
        ),
        inputEPC: optionalNonEmptyQueryString("inputEPC").describe(
          "Input EPC for TransformationEvent queries",
        ),
        outputEPC: optionalNonEmptyQueryString("outputEPC").describe(
          "Output EPC for TransformationEvent queries",
        ),
        limit: optionalIntegerInputParam({
          min: QUERY_LIMIT.MIN,
          max: QUERY_LIMIT.MAX,
          errorMessage: QUERY_LIMIT_ERROR,
        }).describe(
          `Number of results per page (default: ${QUERY_LIMIT.DEFAULT}, max: ${QUERY_LIMIT.MAX})`,
        ),
        offset: optionalIntegerInputParam({
          min: QUERY_OFFSET.MIN,
          errorMessage: QUERY_OFFSET_ERROR,
        }).describe(
          `Number of results to skip for pagination (default: ${QUERY_OFFSET.DEFAULT})`,
        ),
      },
    },
    async (input) => {
      try {
        if (!hasAtLeastOneEpcisFilter(input)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { error: "At least one filter parameter is required." },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        if (!hasValidEpcisDateRange(input)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error:
                      "Parameter 'to' must be greater than or equal to 'from'.",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const { results, resultData, resultCount, pagination } =
          await executeEpcisEventsQuery(input);

        const summary = resultCount
          ? `Found ${resultCount} EPCIS event(s)`
          : "No events found matching the criteria";

        // Build content array with optional source KAs
        const content: { type: "text"; text: string }[] = [
          {
            type: "text",
            text: JSON.stringify(
              {
                summary,
                count: resultCount,
                events: results || [],
                pagination: {
                  limit: pagination.limit,
                  offset: pagination.offset,
                },
              },
              null,
              2,
            ),
          },
        ];

        // Append source Knowledge Assets if available
        const sourceKAs = formatSourceKAs(resultData);
        if (sourceKAs) {
          content.push(sourceKAs);
        }

        return { content };
      } catch (error: any) {
        console.error("[EPCIS] DKG query failed:", error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Query failed",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
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
        epc: requiredNonEmptyString("epc").describe(
          "The EPC to track (e.g., urn:epc:id:sgtin:0614141.107346.2017)",
        ),
      },
    },
    async (input) => {
      try {
        const { resultData, resultCount } = await executeEpcisEventsQuery({
          epc: input.epc,
          fullTrace: true, // Always use full traceability for item tracking
        });

        const summary = buildTrackItemSummary(input.epc, resultData);

        // Build content array with optional source KAs
        const content: { type: "text"; text: string }[] = [
          {
            type: "text",
            text: JSON.stringify(
              {
                summary,
                epc: input.epc,
                eventCount: resultCount,
                events: resultData || [],
              },
              null,
              2,
            ),
          },
        ];

        // Append source Knowledge Assets if available
        const sourceKAs = formatSourceKAs(resultData);
        if (sourceKAs) {
          content.push(sourceKAs);
        }

        return { content };
      } catch (error: any) {
        console.error(`[EPCIS] Item tracking failed, epc: ${input.epc}`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Tracking failed",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // POST /epcis/capture - Accept EPCISDocument and queue for publishing
  api.post(
    "/epcis/capture",
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Capture EPCIS Document",
        description:
          "Accept an EPCISDocument and queue it for publishing to DKG",
        body: z.object({
          epcisDocument: z.object({}).passthrough().openapi({
            description: "The EPCISDocument (JSON-LD)",
          }),
          publishOptions: z
            .object({
              privacy: z.enum(["private", "public"]).optional().openapi({
                description: "Asset visibility (default: private)",
              }),
              epochs: z.number().min(1).optional().openapi({
                description: "Number of epochs to publish for (default: 12)",
              }),
            })
            .optional()
            .openapi({
              description:
                "Publishing options (all optional with sensible defaults)",
            }),
        }),
        response: {
          description: "Capture accepted (202)",
          schema: z.object({
            status: z.string(),
            receivedAt: z.string(),
            captureID: z.string(),
            eventCount: z.number(),
          }),
        },
      },
      async (req, res) => {
        const requestId = generateRequestId();
        console.info(
          `[EPCIS] Capture request received, requestId: ${requestId}`,
        );

        try {
          const { epcisDocument, publishOptions } = req.body;

          const validationResult = validationService.validate(epcisDocument);
          const validationError = getCaptureValidationError(validationResult);
          if (validationError) {
            return res.status(400).json(validationError as any);
          }

          let publishResult: any;
          try {
            publishResult = await sendToPublisher(
              epcisDocument,
              { source: "EPCIS", sourceId: requestId },
              publishOptions,
            );
            console.info(
              `[EPCIS] Document queued via publisher, requestId: ${requestId}, eventCount: ${validationResult.eventCount}, captureID: ${publishResult.id}`,
            );
          } catch (error: any) {
            console.error(
              `[EPCIS] Publishing failed, requestId: ${requestId}, eventCount: ${validationResult.eventCount}, error:`,
              error,
            );
            return res.status(500).json({
              error: "Something went wrong with publishing the EPCIS document.",
              message:
                "Something went wrong with publishing the EPCIS document. Check if the publisher service is available.",
            } as any);
          }

          // Return capture response
          const response: CaptureResponse = {
            status: "202",
            requestId,
            receivedAt: new Date().toISOString(),
            captureID: String(publishResult.id),
            eventCount: validationResult.eventCount ?? 0,
          };

          return res.status(202).json(response);
        } catch (error: any) {
          console.error(
            `[EPCIS] Unexpected error, requestId: ${requestId}, error:`,
            error,
          );
          return res.status(500).json({
            error: "Something went wrong with processing the EPCIS document.",
            message:
              "An unexpected error occurred while processing the EPCIS document.",
          } as any);
        }
      },
    ),
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
          captureID: z
            .string()
            .regex(CAPTURE_ID_PATTERN, { message: "Invalid captureID format" })
            .openapi({
              description:
                "Numeric publisher capture ID returned from POST /epcis/capture",
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
        console.info(
          `[EPCIS] Capture status request received, captureID: ${captureID}`,
        );

        try {
          const response = await fetchPublisherCaptureStatus(captureID);

          if (!response.ok) {
            if (response.status === 404) {
              return res
                .status(404)
                .json({ error: "Capture not found", captureID } as any);
            }
            throw new Error(
              `Publisher returned ${response.status} for captureID: ${captureID}`,
            );
          }

          const asset =
            (await response.json()) as PublisherCaptureStatusResponse;

          return res.json({
            status: asset.status,
            captureID,
            ...(asset.ual && { UAL: asset.ual }),
            ...(asset.publishedAt && { publishedAt: asset.publishedAt }),
            ...(asset.lastError && { error: asset.lastError }),
          });
        } catch (error: unknown) {
          if (isTimeoutError(error)) {
            return res.status(504).json({
              error: "Publisher timeout",
              captureID,
            } as any);
          }

          const errorName =
            error instanceof Error ? error.name : "UnknownError";
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[EPCIS] Capture status request failed, captureID: ${captureID}`,
            { errorName, errorMessage },
          );
          return res.status(500).json({
            error: "Failed to get capture status",
          } as any);
        }
      },
    ),
  );

  // GET /epcis/events - Query EPCIS events from DKG
  api.get(
    "/epcis/events",
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Query EPCIS Events",
        description: "Query EPCIS events from DKG using various filters",
        query: z
          .object({
            epc: optionalNonEmptyQueryString("epc").openapi({
              description: "Filter by EPC (product identifier)",
              example: "urn:epc:id:sgtin:0614141.107346.2017",
            }),
            from: optionalDateTimeQueryString("from").openapi({
              description: "Start of time range (ISO 8601)",
              example: "2024-01-01T00:00:00Z",
            }),
            to: optionalDateTimeQueryString("to").openapi({
              description: "End of time range (ISO 8601)",
              example: "2024-12-31T23:59:59Z",
            }),
            bizStep: optionalNonEmptyQueryString("bizStep").openapi({
              description: "Filter by business step URI",
              example: "https://ref.gs1.org/cbv/BizStep-assembling",
            }),
            bizLocation: optionalNonEmptyQueryString("bizLocation").openapi({
              description: "Filter by business location",
              example: "urn:epc:id:sgln:0614141.00001.0",
            }),
            fullTrace: z
              .enum(["true", "false"])
              .transform((v) => v === "true")
              .optional()
              .openapi({
                description:
                  "If 'true', search all EPC fields for full supply chain traceability",
                example: "true",
              }),
            parentID: optionalNonEmptyQueryString("parentID").openapi({
              description: "Filter by parent ID (AggregationEvent)",
              example: "urn:epc:id:sscc:0614141.0000000001",
            }),
            childEPC: optionalNonEmptyQueryString("childEPC").openapi({
              description: "Filter by child EPC (AggregationEvent)",
              example: "urn:epc:id:sgtin:0614141.107346.2017",
            }),
            inputEPC: optionalNonEmptyQueryString("inputEPC").openapi({
              description: "Filter by input EPC (TransformationEvent)",
              example: "urn:epc:id:sgtin:0614141.107346.2017",
            }),
            outputEPC: optionalNonEmptyQueryString("outputEPC").openapi({
              description: "Filter by output EPC (TransformationEvent)",
              example: "urn:epc:id:sgtin:0614141.099999.9001",
            }),
            limit: optionalIntegerQueryParam({
              min: 1,
              max: 1000,
              errorMessage: QUERY_LIMIT_ERROR,
            }).openapi({
              description: `Number of results per page (default: ${QUERY_LIMIT.DEFAULT}, max: ${QUERY_LIMIT.MAX})`,
              example: "50",
            }),
            offset: optionalIntegerQueryParam({
              min: 0,
              errorMessage: QUERY_OFFSET_ERROR,
            }).openapi({
              description: `Number of results to skip for pagination (default: ${QUERY_OFFSET.DEFAULT})`,
              example: "0",
            }),
          })
          .refine(hasAtLeastOneEpcisFilter, {
            message: "At least one filter parameter is required.",
          })
          .refine(hasValidEpcisDateRange, {
            path: ["to"],
            message: "Parameter 'to' must be greater than or equal to 'from'.",
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
        console.info("[EPCIS] Events query received");
        try {
          const { resultData, resultCount, pagination } =
            await executeEpcisEventsQuery(req.query);

          res.json({
            success: true,
            results: resultData,
            count: resultCount,
            pagination: {
              limit: pagination.limit,
              offset: pagination.offset,
            },
          });
        } catch (error: any) {
          console.error("[EPCIS] Events query failed:", error);
          res.status(500).json({
            success: false,
            error: "Failed to query events",
          } as any);
        }
      },
    ),
  );
});
