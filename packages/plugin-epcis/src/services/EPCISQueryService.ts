import type { EpcisQueryParams } from "../model/types";
/**
 * EPCIS Query Service
 * Supports composite filtering - combine multiple filters in one query
 */

const PREFIXES = `
PREFIX epcis: <https://gs1.github.io/EPCIS/>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

/**
 * Escape special characters in SPARQL string literals
 */
function escapeSparql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Normalize bizStep to full GS1 CBV URI
 * Accepts: "assembling" or "https://ref.gs1.org/cbv/BizStep-assembling"
 */
function normalizeBizStep(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid bizStep value");
  }

  if (!value.includes("://")) {
    return `https://ref.gs1.org/cbv/BizStep-${value}`;
  }
  return value;
}

export class EpcisQueryService {
  /**
   * Build a composite SPARQL query supporting multiple filters
   * All provided filters are combined with AND logic
   */
  buildQuery(params: EpcisQueryParams): string {
    const wherePatterns: string[] = [];
    const filterClauses: string[] = [];
    const optionalClauses: string[] = [];

    // Base pattern - always present
    wherePatterns.push("?event a ?eventType .");

    // Filter by event type (must be EPCIS event)
    filterClauses.push(
      'FILTER(STRSTARTS(STR(?eventType), "https://gs1.github.io/EPCIS/"))',
    );

    // EPC filter - with optional full traceability across all EPC fields
    if (params.epc) {
      const epcValue = escapeSparql(params.epc);
      if (params.fullTrace) {
        // Search across ALL EPC fields for full supply chain traceability
        wherePatterns.push(`{
          { ?event epcis:epcList "${epcValue}" }
          UNION { ?event epcis:inputEPCList "${epcValue}" }
          UNION { ?event epcis:outputEPCList "${epcValue}" }
          UNION { ?event epcis:childEPCs "${epcValue}" }
          UNION { ?event epcis:parentID "${epcValue}" }
        }`);
      } else {
        // Default: only search epcList
        wherePatterns.push(`?event epcis:epcList "${epcValue}" .`);
      }
    } else {
      optionalClauses.push("OPTIONAL { ?event epcis:epcList ?epc . }");
    }

    // Parent ID filter (AggregationEvent)
    if (params.parentID) {
      wherePatterns.push(
        `?event epcis:parentID "${escapeSparql(params.parentID)}" .`,
      );
    }

    // Child EPCs filter (AggregationEvent)
    if (params.childEPC) {
      wherePatterns.push(
        `?event epcis:childEPCs "${escapeSparql(params.childEPC)}" .`,
      );
    }

    // Input EPCs filter (TransformationEvent)
    if (params.inputEPC) {
      wherePatterns.push(
        `?event epcis:inputEPCList "${escapeSparql(params.inputEPC)}" .`,
      );
    }

    // Output EPCs filter (TransformationEvent)
    if (params.outputEPC) {
      wherePatterns.push(
        `?event epcis:outputEPCList "${escapeSparql(params.outputEPC)}" .`,
      );
    }

    // BizStep filter (accepts shorthand like "assembling" or full URI)
    if (params.bizStep) {
      const bizStepUri = normalizeBizStep(params.bizStep);
      wherePatterns.push("?event epcis:bizStep ?bizStep .");
      filterClauses.push(
        `FILTER(STR(?bizStep) = "${escapeSparql(bizStepUri)}")`,
      );
    } else {
      optionalClauses.push("OPTIONAL { ?event epcis:bizStep ?bizStep . }");
    }

    // BizLocation filter
    if (params.bizLocation) {
      wherePatterns.push(
        `?event epcis:bizLocation "${escapeSparql(params.bizLocation)}" .`,
      );
    } else {
      optionalClauses.push(
        "OPTIONAL { ?event epcis:bizLocation ?bizLocation . }",
      );
    }

    // Time range filter - use xsd:dateTime for proper date comparison
    if (params.from || params.to) {
      wherePatterns.push("?event epcis:eventTime ?eventTime .");
      if (params.from && params.to) {
        filterClauses.push(
          `FILTER(xsd:dateTime(?eventTime) >= xsd:dateTime("${escapeSparql(params.from)}") && xsd:dateTime(?eventTime) <= xsd:dateTime("${escapeSparql(params.to)}"))`,
        );
      } else if (params.from) {
        filterClauses.push(
          `FILTER(xsd:dateTime(?eventTime) >= xsd:dateTime("${escapeSparql(params.from)}"))`,
        );
      } else if (params.to) {
        filterClauses.push(
          `FILTER(xsd:dateTime(?eventTime) <= xsd:dateTime("${escapeSparql(params.to)}"))`,
        );
      }
    } else {
      optionalClauses.push("OPTIONAL { ?event epcis:eventTime ?eventTime . }");
    }

    // Always optional fields
    optionalClauses.push(
      "OPTIONAL { ?event epcis:disposition ?disposition . }",
    );
    optionalClauses.push("OPTIONAL { ?event epcis:readPoint ?readPoint . }");
    optionalClauses.push("OPTIONAL { ?event epcis:action ?action . }");
    optionalClauses.push("OPTIONAL { ?event epcis:parentID ?parentID . }");
    optionalClauses.push("OPTIONAL { ?event epcis:childEPCs ?childEPCs . }");
    optionalClauses.push(
      "OPTIONAL { ?event epcis:inputEPCList ?inputEPCList . }",
    );
    optionalClauses.push(
      "OPTIONAL { ?event epcis:outputEPCList ?outputEPCList . }",
    );

    // Pagination with defaults and max limits
    const limit = Math.min(params.limit ?? 100, 1000); // Default 100, max 1000
    const offset = params.offset ?? 0;

    // Assemble the query with GROUP_CONCAT for array fields
    return `${PREFIXES}
SELECT ?ual ?eventType ?eventTime ?bizStep ?bizLocation ?disposition ?readPoint ?action ?parentID
  (GROUP_CONCAT(DISTINCT ?epc; SEPARATOR=", ") AS ?epcList)
  (GROUP_CONCAT(DISTINCT ?childEPCs; SEPARATOR=", ") AS ?childEPCList)
  (GROUP_CONCAT(DISTINCT ?inputEPCList; SEPARATOR=", ") AS ?inputEPCs)
  (GROUP_CONCAT(DISTINCT ?outputEPCList; SEPARATOR=", ") AS ?outputEPCs)
WHERE {
  GRAPH ?ual {
    ${wherePatterns.join("\n    ")}
    ${optionalClauses.join("\n    ")}
  }
  ${filterClauses.join("\n  ")}
}
GROUP BY ?ual ?eventType ?eventTime ?bizStep ?bizLocation ?disposition ?readPoint ?action ?parentID
ORDER BY DESC(?eventTime)
LIMIT ${limit}
OFFSET ${offset}`;
  }
}
