import Ajv from "ajv";
import addFormats from "ajv-formats";
import epcisSchema from "../schemas/epcis-json-schema.json";
import type { EPCISDocument, ValidationResult } from "../model/types";

export class EpcisValidationService {
  private ajv: Ajv;
  private validateSchema: ReturnType<Ajv["compile"]>;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });
    addFormats(this.ajv);

    // Compile the EPCIS schema
    this.validateSchema = this.ajv.compile(epcisSchema);
  }

  /**
   * Validate an EPCISDocument against the GS1 JSON Schema
   */
  validate(document: unknown): ValidationResult {
    // Check basic structure first
    if (!document || typeof document !== "object") {
      return {
        valid: false,
        errors: ["Document must be a valid JSON object"],
      };
    }

    const doc = document as EPCISDocument;

    // Check for required type
    if (doc.type !== "EPCISDocument") {
      return {
        valid: false,
        errors: [`Invalid type: expected "EPCISDocument", got "${doc.type}"`],
      };
    }

    // Get event list from either location
    const eventList = doc.eventList || doc.epcisBody?.eventList;

    if (!eventList || !Array.isArray(eventList) || eventList.length === 0) {
      return {
        valid: false,
        errors: ["EPCISDocument must contain at least one event in eventList or epcisBody.eventList"],
      };
    }

    // Validate against GS1 schema
    const isValid = this.validateSchema(document);

    if (!isValid) {
      const errors = this.validateSchema.errors?.map((err) => {
        return `${err.instancePath || "/"}: ${err.message}`;
      }) || ["Unknown validation error"];

      return {
        valid: false,
        errors,
        eventCount: eventList.length,
      };
    }

    return {
      valid: true,
      eventCount: eventList.length,
    };
  }

  /**
   * Extract events from an EPCISDocument
   */
  extractEvents(document: EPCISDocument): EPCISDocument["eventList"] {
    return document.eventList || document.epcisBody?.eventList || [];
  }
}