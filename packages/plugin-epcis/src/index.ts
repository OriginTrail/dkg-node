import { defineDkgPlugin, withRequiredMcpScope } from "@dkg/plugins";
import { openAPIRoute, z } from "@dkg/plugin-swagger";
import type { EpcisQueryParams, ValidationResult } from "./model/types";
import { EpcisQueryService } from "./services/epcisQueryService";
import {
  fetchPublisherCaptureStatus,
  isTimeoutError,
  sendToPublisher,
} from "./services/epcisPublisherService";
import { EpcisValidationService } from "./services/epcisValidationService";
import {
  hasAtLeastOneEpcisFilter,
  hasValidEpcisDateRange,
  optionalDateTimeQueryString,
  optionalIntegerInputParam,
  optionalIntegerQueryParam,
  optionalNonEmptyQueryString,
  requiredNonEmptyString,
} from "./utils/epcisQueryValidation";
import { formatSourceKAs } from "./utils/sourceKa";
import { EPCIS_ROUTE_PATHS } from "./httpScopeGuards";

export {
  applyEpcisHttpScopeGuards,
  EPCIS_HTTP_SCOPE_RULES,
  EPCIS_ROUTE_PATHS,
} from "./httpScopeGuards";

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
const CAPTURE_PUBLISH_ERROR = {
  error: "Something went wrong with publishing the EPCIS document.",
  message:
    "Something went wrong with publishing the EPCIS document. Check if the publisher service is available.",
};
const CAPTURE_ID_PATTERN = /^[0-9]{1,20}$/;

type CaptureResponse = {
  status: string;
  requestId: string;
  receivedAt: string;
  captureID: string;
  eventCount: number;
  UAL?: string;
};

type CaptureStatusResponse = {
  status: string;
  captureID: string;
  UAL?: string;
  publishedAt?: string;
  error?: string;
};

type PublishOptions = {
  privacy?: "private" | "public";
  epochs?: number;
};

type PublisherCaptureStatusResponse = {
  status: string;
  ual?: string;
  publishedAt?: string;
  lastError?: string;
};

class CaptureValidationError extends Error {
  constructor(
    readonly payload: {
      error: string;
      details?: string[];
      message?: string;
    },
  ) {
    super(payload.error);
    this.name = "CaptureValidationError";
  }
}

class CapturePublishError extends Error {
  constructor() {
    super("Something went wrong with publishing the EPCIS document.");
    this.name = "CapturePublishError";
  }
}

type McpTextContent = { type: "text"; text: string };

function toMcpText(payload: unknown): McpTextContent {
  return { type: "text", text: JSON.stringify(payload, null, 2) };
}

function mcpSuccess(
  payload: unknown,
  extraContent: McpTextContent[] = [],
): { content: McpTextContent[] } {
  return { content: [toMcpText(payload), ...extraContent] };
}

function mcpError(payload: unknown): {
  content: McpTextContent[];
  isError: true;
} {
  return {
    content: [toMcpText(payload)],
    isError: true,
  };
}

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

  async function executeCapture(
    epcisDocument: object,
    publishOptions?: PublishOptions,
    requestId: string = generateRequestId(),
  ): Promise<CaptureResponse> {
    const validationResult = validationService.validate(epcisDocument);
    const validationError = getCaptureValidationError(validationResult);
    if (validationError) {
      throw new CaptureValidationError(validationError);
    }

    let publishResult: any;
    try {
      publishResult = await sendToPublisher(
        epcisDocument,
        { source: "EPCIS", sourceId: requestId },
        publishOptions,
      );
    } catch {
      throw new CapturePublishError();
    }

    return {
      status: "202",
      requestId,
      receivedAt: new Date().toISOString(),
      captureID: String(publishResult.id),
      eventCount: validationResult.eventCount ?? 0,
    };
  }

  async function parseCaptureStatus(
    captureID: string,
  ): Promise<
    { notFound: true } | ({ notFound: false } & CaptureStatusResponse)
  > {
    const response = await fetchPublisherCaptureStatus(captureID);
    if (!response.ok) {
      if (response.status === 404) {
        return { notFound: true };
      }
      throw new Error(`Publisher returned ${response.status}`);
    }

    const asset = (await response.json()) as PublisherCaptureStatusResponse;
    return {
      notFound: false,
      status: asset.status,
      captureID,
      ...(asset.ual && { UAL: asset.ual }),
      ...(asset.publishedAt && { publishedAt: asset.publishedAt }),
      ...(asset.lastError && { error: asset.lastError }),
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
    withRequiredMcpScope("epcis.read", async (input) => {
      try {
        if (!hasAtLeastOneEpcisFilter(input)) {
          return mcpError({
            error: "At least one filter parameter is required.",
          });
        }

        if (!hasValidEpcisDateRange(input)) {
          return mcpError({
            error: "Parameter 'to' must be greater than or equal to 'from'.",
          });
        }

        const { resultData, resultCount, pagination } =
          await executeEpcisEventsQuery(input);

        const summary = resultCount
          ? `Found ${resultCount} EPCIS event(s)`
          : "No events found matching the criteria";

        const sourceKAs = formatSourceKAs(resultData);
        return mcpSuccess(
          {
            summary,
            count: resultCount,
            events: resultData || [],
            pagination: {
              limit: pagination.limit,
              offset: pagination.offset,
            },
          },
          sourceKAs ? [sourceKAs] : [],
        );
      } catch (error: any) {
        console.error("[EPCIS] DKG query failed:", error);
        return mcpError({ error: "Query failed" });
      }
    }),
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
    withRequiredMcpScope("epcis.read", async (input) => {
      try {
        const { resultData, resultCount } = await executeEpcisEventsQuery({
          epc: input.epc,
          fullTrace: true, // Always use full traceability for item tracking
        });

        const summary = buildTrackItemSummary(input.epc, resultData);

        const sourceKAs = formatSourceKAs(resultData);
        return mcpSuccess(
          {
            summary,
            epc: input.epc,
            eventCount: resultCount,
            events: resultData || [],
          },
          sourceKAs ? [sourceKAs] : [],
        );
      } catch (error: any) {
        console.error(`[EPCIS] Item tracking failed, epc: ${input.epc}`, error);
        return mcpError({ error: "Tracking failed" });
      }
    }),
  );

  // MCP Tool: Capture EPCISDocument and queue for publishing
  mcp.registerTool(
    "epcis-capture",
    {
      title: "Capture EPCIS Document",
      description:
        "Validate an EPCISDocument and queue it for publishing to the DKG.",
      inputSchema: {
        epcisDocument: z.object({}).passthrough(),
        publishOptions: z
          .object({
            privacy: z.enum(["private", "public"]).optional(),
            epochs: z.number().min(1).optional(),
          })
          .optional(),
      },
    },
    withRequiredMcpScope("epcis.write", async (input) => {
      try {
        const response = await executeCapture(
          input.epcisDocument,
          input.publishOptions,
        );
        return mcpSuccess({
          captureID: response.captureID,
          requestId: response.requestId,
          receivedAt: response.receivedAt,
          eventCount: response.eventCount,
        });
      } catch (error: unknown) {
        if (error instanceof CaptureValidationError) {
          return mcpError(error.payload);
        }

        if (error instanceof CapturePublishError) {
          return mcpError(CAPTURE_PUBLISH_ERROR);
        }

        console.error("[EPCIS] MCP capture failed:", error);
        return mcpError({ error: "Capture failed" });
      }
    }),
  );

  // MCP Tool: Check publisher-tracked status by capture ID
  mcp.registerTool(
    "epcis-capture-status",
    {
      title: "Get Capture Status",
      description: "Check publisher-tracked status for a capture request.",
      inputSchema: {
        captureID: z
          .string()
          .regex(CAPTURE_ID_PATTERN, { message: "Invalid captureID format" })
          .describe(
            "Numeric publisher capture ID returned from epcis-capture or POST /epcis/capture",
          ),
      },
    },
    withRequiredMcpScope("epcis.write", async (input) => {
      try {
        const captureStatus = await parseCaptureStatus(input.captureID);
        if (captureStatus.notFound) {
          return mcpError({
            error: "Capture not found",
            captureID: input.captureID,
          });
        }

        const payload: CaptureStatusResponse = {
          status: captureStatus.status,
          captureID: captureStatus.captureID,
          ...(captureStatus.UAL && { UAL: captureStatus.UAL }),
          ...(captureStatus.publishedAt && {
            publishedAt: captureStatus.publishedAt,
          }),
          ...(captureStatus.error && { error: captureStatus.error }),
        };
        return mcpSuccess(payload);
      } catch (error: unknown) {
        if (isTimeoutError(error)) {
          return mcpError({
            error: "Publisher timeout",
            captureID: input.captureID,
          });
        }

        console.error(
          `[EPCIS] MCP capture status failed, captureID: ${input.captureID}`,
          error,
        );
        return mcpError({
          error: "Failed to get capture status",
          captureID: input.captureID,
        });
      }
    }),
  );

  // POST /epcis/capture - Accept EPCISDocument and queue for publishing
  api.post(
    EPCIS_ROUTE_PATHS.capture,
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
            requestId: z.string(),
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
          const response = await executeCapture(
            epcisDocument,
            publishOptions,
            requestId,
          );
          console.info(
            `[EPCIS] Document queued via publisher, requestId: ${response.requestId}, eventCount: ${response.eventCount}, captureID: ${response.captureID}`,
          );

          return res.status(202).json(response);
        } catch (error: unknown) {
          if (error instanceof CaptureValidationError) {
            console.warn(
              `[EPCIS] Capture validation failed, requestId: ${requestId}`,
            );
            return res.status(400).json(error.payload as any);
          }

          if (error instanceof CapturePublishError) {
            console.error(`[EPCIS] Publishing failed, requestId: ${requestId}`);
            return res.status(500).json(CAPTURE_PUBLISH_ERROR as any);
          }

          console.error(
            `[EPCIS] Unexpected error while processing capture request, requestId: ${requestId}:`,
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
    EPCIS_ROUTE_PATHS.captureStatus,
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
          const captureStatus = await parseCaptureStatus(captureID);
          if (captureStatus.notFound) {
            return res
              .status(404)
              .json({ error: "Capture not found", captureID } as any);
          }

          const payload: CaptureStatusResponse = {
            status: captureStatus.status,
            captureID: captureStatus.captureID,
            ...(captureStatus.UAL && { UAL: captureStatus.UAL }),
            ...(captureStatus.publishedAt && {
              publishedAt: captureStatus.publishedAt,
            }),
            ...(captureStatus.error && { error: captureStatus.error }),
          };
          return res.json(payload);
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
          console.error("[EPCIS] Capture status request failed", {
            captureID,
            errorName,
            errorMessage,
          });
          return res.status(500).json({
            error: "Failed to get capture status",
          } as any);
        }
      },
    ),
  );

  // GET /epcis/events - Query EPCIS events from DKG
  api.get(
    EPCIS_ROUTE_PATHS.events,
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

  // GET /epcis/events/track - Track single EPC across full trace
  api.get(
    EPCIS_ROUTE_PATHS.trackEvents,
    openAPIRoute(
      {
        tag: "EPCIS",
        summary: "Track Item Journey",
        description:
          "Track a single EPC across all event types using full traceability.",
        query: z.object({
          epc: requiredNonEmptyString("epc").openapi({
            description: "EPC identifier to track",
            example: "urn:epc:id:sgtin:0614141.107346.2017",
          }),
        }),
        response: {
          description: "Tracking query results",
          schema: z.object({
            success: z.boolean(),
            results: z.array(z.any()),
            count: z.number(),
          }),
        },
      },
      async (req, res) => {
        console.info("[EPCIS] Track item query received");
        try {
          const { resultData, resultCount } = await executeEpcisEventsQuery({
            epc: req.query.epc,
            fullTrace: true,
          });

          res.json({
            success: true,
            results: resultData,
            count: resultCount,
          });
        } catch (error: any) {
          console.error("[EPCIS] Track query failed:", error);
          res.status(500).json({
            success: false,
            error: "Failed to query events",
          } as any);
        }
      },
    ),
  );
});
