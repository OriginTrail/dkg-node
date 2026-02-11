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
  
  // API Response types
  export interface CaptureResponse {
    status: string;
    receivedAt: string;
    captureID: string;
    eventCount: number;
    UAL?: string;
  }
  
  export interface CaptureStatusResponse {
    status: "pending" | "queued" | "assigned" | "publishing" | "published" | "failed";
    UAL?: string;
    eventCount?: number;
    error?: string;
    publishedAt?: string | null;
  }
  
  // Validation result type
  export interface ValidationResult {
    valid: boolean;
    errors?: string[];
    eventCount?: number;
  }