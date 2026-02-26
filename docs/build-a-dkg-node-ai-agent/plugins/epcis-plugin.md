# EPCIS Plugin

The EPCIS plugin integrates EPCIS 2.0 supply-chain event data with the DKG Node.

It provides both HTTP endpoints and MCP tools for:

- capturing EPCIS documents
- checking capture status
- querying events with filters
- retrieving published assets by UAL

## Source

- Plugin code: `packages/plugin-epcis/src/index.ts`
- Query service: `packages/plugin-epcis/src/services/epcisQueryService.ts`
- Integration guide: `packages/plugin-epcis/docs/EPCIS-Integration-Guide.md`

## Quick Start

1. Ensure publisher plugin and epcis plugin is enabled in server plugin registration:
   - `apps/agent/src/server/index.ts` should include `dkgPublisherPlugin` in the `plugins` array.
   - `apps/agent/src/server/index.ts` should include `epcisPlugin` in the `plugins` array.
2. Run publisher plugin setup:
   - `cd packages/plugin-dkg-publisher && npm run setup`
   - This initializes publisher configuration (including `.env.publisher`) for the publisher flow.
3. Configure runtime environment:
   - `EXPO_PUBLIC_MCP_URL=http://localhost:9200` (local same-host setup)
4. Start the DKG Node server.
5. Submit an EPCIS document via `POST /epcis/capture`.
6. Query captured events via `GET /epcis/events`.

## Capabilities

### API Endpoints

- `POST /epcis/capture`  
  Accepts an EPCIS document and sends it to publisher flow.  
  Returns a numeric `captureID` on success.

- `GET /epcis/capture/:captureID`  
  Gets publisher-tracked status for numeric capture IDs.

- `GET /epcis/events`  
  Queries EPCIS events with filtering and pagination.

- `GET /epcis/asset/*ual`  
  Retrieves an EPCIS asset by UAL.

### MCP Tools

- `epcis-query`
- `epcis-track-item`

## Configuration

Required runtime env var:

- `EXPO_PUBLIC_MCP_URL` (example local setup: `http://localhost:9200`)

Runtime dependency:

- Publisher API must be available through the same server URL (or routed URL) used by `EXPO_PUBLIC_MCP_URL`.

If `EXPO_PUBLIC_MCP_URL` is not set, capture and status calls that depend on publisher will fail.

## Example Requests

### Capture EPCIS document

```bash
curl -X POST "http://localhost:9200/epcis/capture" \
  -H "Content-Type: application/json" \
  -d '{
    "epcisDocument": {
      "@context": {
        "@vocab": "https://gs1.github.io/EPCIS/",
        "epcis": "https://gs1.github.io/EPCIS/",
        "cbv": "https://ref.gs1.org/cbv/",
        "type": "@type",
        "id": "@id"
      },
      "type": "EPCISDocument",
      "schemaVersion": "2.0",
      "creationDate": "2024-03-01T08:00:00Z",
      "epcisBody": {
        "eventList": [
          {
            "type": "ObjectEvent",
            "eventTime": "2024-03-01T08:00:00.000Z",
            "eventTimeZoneOffset": "+00:00",
            "epcList": ["urn:epc:id:sgtin:4012345.011111.1001"],
            "action": "ADD",
            "bizStep": "https://ref.gs1.org/cbv/BizStep-receiving",
            "disposition": "https://ref.gs1.org/cbv/Disp-in_progress",
            "readPoint": { "id": "urn:epc:id:sgln:4012345.00001.0" },
            "bizLocation": { "id": "urn:epc:id:sgln:4012345.00001.0" },
            "bizTransactionList": [
              {
                "type": "https://ref.gs1.org/cbv/BTT-po",
                "bizTransaction": "urn:epc:id:gdti:4012345.00001.PO-2024-001"
              }
            ]
          }
        ]
      }
    },
    "publishOptions": {
      "privacy": "private",
      "epochs": 12
    }
  }'
```

### Check capture status

```bash
curl "http://localhost:9200/epcis/capture/123"
```

### Query events with filters

```bash
curl "http://localhost:9200/epcis/events?epc=urn:epc:id:sgtin:4012345.011111.1001&fullTrace=true&limit=50&offset=0"
```

## Query Notes

- `fullTrace` (HTTP query) supports: `"true"` or `"false"`
- `limit`: integer `1..1000`
- `offset`: integer `>= 0`
- `bizStep` accepts shorthand (for example `assembling`) or full URI

## Response and Validation Notes

- `POST /epcis/capture` validates the EPCIS document structure before publishing.
- `GET /epcis/capture/:captureID` expects numeric capture IDs from publisher responses.
- `GET /epcis/events` rejects invalid pagination and empty-string filter parameters.

## Troubleshooting

- `Publisher endpoint not configured. Set EXPO_PUBLIC_MCP_URL in .env`  
  Set `EXPO_PUBLIC_MCP_URL` in runtime environment.

- `Invalid captureID format`  
  Use numeric capture IDs returned by `POST /epcis/capture`.

- `Parameter 'limit' must be an integer between 1 and 1000`  
  Ensure pagination values are valid integers.

## Related Documentation

For full EPCIS field-level details and examples, see:

- `packages/plugin-epcis/docs/EPCIS-Integration-Guide.md`

