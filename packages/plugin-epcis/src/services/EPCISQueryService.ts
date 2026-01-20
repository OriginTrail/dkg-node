/**
 * EPCIS Query Service
 * Supports composite filtering - combine multiple filters in one query
 */

// Namespace prefixes for EPCIS queries
const PREFIXES = `
PREFIX epcis: <https://gs1.github.io/EPCIS/>
PREFIX kam: <https://kam.example.com/epcis/>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export interface EpcisQueryParams {
  epc?: string;
  from?: string;
  to?: string;
  bizStep?: string;
  bizLocation?: string;
  ual?: string;
  /** If true, searches all EPC fields (epcList, inputEPCList, outputEPCList, childEPCs, parentID) */
  fullTrace?: boolean;
}

/**
 * Escape special characters in SPARQL string literals
 */
function escapeSparql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Normalize bizStep to full GS1 CBV URI
 * Accepts: "assembling" or "https://ref.gs1.org/cbv/BizStep-assembling"
 */
function normalizeBizStep(value: string): string {

  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid bizStep value");
  }
  
  if (!value.includes('://')) {
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
    // Special case: UAL lookup returns all triples for that graph
    if (params.ual) {
      return this.getEventByUal(params.ual);
    }

    const wherePatterns: string[] = [];
    const filterClauses: string[] = [];
    const optionalClauses: string[] = [];

    // Base pattern - always present
    wherePatterns.push('?event a ?eventType .');

    // Filter by event type (must be EPCIS event)
    filterClauses.push('FILTER(STRSTARTS(STR(?eventType), "https://gs1.github.io/EPCIS/"))');

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
      optionalClauses.push('OPTIONAL { ?event epcis:epcList ?epc . }');
    }

    // BizStep filter (accepts shorthand like "assembling" or full URI)
    if (params.bizStep) {
      const bizStepUri = normalizeBizStep(params.bizStep);
      wherePatterns.push('?event epcis:bizStep ?bizStep .');
      filterClauses.push(`FILTER(STR(?bizStep) = "${escapeSparql(bizStepUri)}")`);
    } else {
      optionalClauses.push('OPTIONAL { ?event epcis:bizStep ?bizStep . }');
    }

    // BizLocation filter
    if (params.bizLocation) {
      wherePatterns.push(`?event epcis:bizLocation "${escapeSparql(params.bizLocation)}" .`);
    } else {
      optionalClauses.push('OPTIONAL { ?event epcis:bizLocation ?bizLocation . }');
    }

    // Time range filter
    if (params.from || params.to) {
      wherePatterns.push('?event epcis:eventTime ?eventTime .');
      if (params.from && params.to) {
        filterClauses.push(
          `FILTER(STR(?eventTime) >= "${escapeSparql(params.from)}" && STR(?eventTime) <= "${escapeSparql(params.to)}")`
        );
      } else if (params.from) {
        filterClauses.push(`FILTER(STR(?eventTime) >= "${escapeSparql(params.from)}")`);
      } else if (params.to) {
        filterClauses.push(`FILTER(STR(?eventTime) <= "${escapeSparql(params.to)}")`);
      }
    } else {
      optionalClauses.push('OPTIONAL { ?event epcis:eventTime ?eventTime . }');
    }

    // Always optional fields
    optionalClauses.push('OPTIONAL { ?event epcis:disposition ?disposition . }');
    optionalClauses.push('OPTIONAL { ?event epcis:readPoint ?readPoint . }');

    // Assemble the query
    return `${PREFIXES}
SELECT ?ual ?eventType ?eventTime ?epc ?bizStep ?disposition ?readPoint ?bizLocation
WHERE {
  GRAPH ?ual {
    ${wherePatterns.join('\n    ')}
    ${optionalClauses.join('\n    ')}
  }
  ${filterClauses.join('\n  ')}
}
ORDER BY DESC(?eventTime)
LIMIT 100`;
  }

  /**
   * Query event by UAL (get full event details)
   */
  private getEventByUal(ual: string): string {
    // Basic UAL format validation
    if (!ual.startsWith('did:')) {
      throw new Error('Invalid UAL format');
    }
    return `${PREFIXES}
SELECT ?predicate ?object
WHERE {
  GRAPH <${escapeSparql(ual)}> {
    ?subject ?predicate ?object .
  }
}`;
  }
}
