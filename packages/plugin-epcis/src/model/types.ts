// EPCIS Document types based on GS1 EPCIS 2.0
export interface EPCISDocument {
  "@context": string | string[] | Record<string, any>;
  type: "EPCISDocument";
  schemaVersion: string;
  creationDate: string;
  epcisBody?: {
    eventList: EPCISEvent[];
  };
  eventList?: EPCISEvent[];
  [key: string]: any;
}

export interface EPCISEvent {
  type: string;
  eventTime: string;
  eventTimeZoneOffset?: string;
  epcList?: string[];
  action?: string;
  bizStep?: string;
  disposition?: string;
  readPoint?: { id: string };
  bizLocation?: { id: string };
  bizTransactionList?: Array<{ type: string; bizTransaction: string }>;
  sensorElementList?: any[];
  [key: string]: any;
}

// Validation result type
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  eventCount?: number;
}

export interface EpcisQueryParams {
  epc?: string;
  from?: string;
  to?: string;
  bizStep?: string;
  bizLocation?: string;
  /** If true, searches all EPC fields (epcList, inputEPCList, outputEPCList, childEPCs, parentID) */
  fullTrace?: boolean;
  /** Filter by parent ID (AggregationEvent) */
  parentID?: string;
  /** Filter by child EPCs (AggregationEvent) */
  childEPC?: string;
  /** Filter by input EPCs (TransformationEvent) */
  inputEPC?: string;
  /** Filter by output EPCs (TransformationEvent) */
  outputEPC?: string;
  /** Number of results per page (default: 100, max: 1000) */
  limit?: number;
  /** Number of results to skip (for pagination) */
  offset?: number;
}
