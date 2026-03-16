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
    const isValid = this.validateSchema(document);

    if (!isValid) {
      const errors = this.validateSchema.errors?.map((err) => {
        return `${err.instancePath || "/"}: ${err.message}`;
      }) || ["Unknown validation error"];

      return {
        valid: false,
        errors,
      };
    }

    // Count events for response
    const doc = document as EPCISDocument;
    const eventList = doc.epcisBody?.eventList || [];

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