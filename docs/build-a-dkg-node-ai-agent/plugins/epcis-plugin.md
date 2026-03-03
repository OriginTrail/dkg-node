# EPCIS Plugin

The EPCIS plugin integrates EPCIS 2.0 supply-chain event data with the DKG Node.

It provides both HTTP endpoints and MCP tools for:

- capturing EPCIS documents
- checking capture status
- querying events with filters
- tracking an item journey with full traceability

## Source

- Plugin code: `packages/plugin-epcis/src/index.ts`
- Query service: `packages/plugin-epcis/src/services/epcisQueryService.ts`
- Integration guide: `packages/plugin-epcis/docs/EPCIS-Integration-Guide.md`

## Runtime state in this repository

- The current main server setup in `apps/agent/src/server/index.ts` does **not** register `@dkg/plugin-epcis` by default.
- This means `/epcis/*` routes and EPCIS MCP tools are unavailable in the default runtime until the plugin is mounted.
- `epcis.read` and `epcis.write` are still declared OAuth scopes, but they only take effect for EPCIS once the plugin and HTTP scope guards are enabled.

## Quick Start

1. Enable EPCIS + publisher plugins in server plugin registration (this is not enabled by default in this repo):
   - `apps/agent/src/server/index.ts` should include `epcisPlugin` in the `plugins` array.
   - `apps/agent/src/server/index.ts` should include `dkgPublisherPlugin` in the `plugins` array.
   - If you want route-level EPCIS scope enforcement, apply `applyEpcisHttpScopeGuards(api, authorized)` in the auth middleware plugin.
2. Run publisher plugin setup:
   - `cd packages/plugin-dkg-publisher && npm run setup`
   - This initializes publisher configuration (including `.env.publisher`) for the publisher flow.
3. Configure runtime environment:
   - `EXPO_PUBLIC_MCP_URL=http://localhost:9200` (local same-host setup)
4. Create a token with EPCIS scopes:
   - `cd apps/agent && npm run script:createToken`
   - Scope input examples:
     - API only: `epcis.read epcis.write`
     - MCP tools: `mcp epcis.read epcis.write`
5. Start the DKG Node server.
6. Submit an EPCIS document via `POST /epcis/capture`.
7. Query captured events via `GET /epcis/events`.

EPCIS authorization scopes:

- `epcis.read`: `GET /epcis/events`, `GET /epcis/events/track`, and MCP tools `epcis-query`, `epcis-track-item`
- `epcis.write`: `POST /epcis/capture`, `GET /epcis/capture/:captureID`, and MCP tools `epcis-capture`, `epcis-capture-status`
- MCP transport still requires `mcp` scope on `/mcp`

Implementation note: EPCIS MCP tool handlers are guarded with `withRequiredMcpScope(...)` in `packages/plugin-epcis/src/index.ts`, while keeping standard `mcp.registerTool(...)` registration.

## Capabilities

### API Endpoints

- `POST /epcis/capture`  
  Accepts an EPCIS document and sends it to publisher flow.  
  Returns a numeric `captureID` on success.

- `GET /epcis/capture/:captureID`  
  Gets publisher-tracked status for numeric capture IDs.

- `GET /epcis/events`  
  Queries EPCIS events with filtering and pagination.

- `GET /epcis/events/track`  
  Tracks a single EPC across all event types using full traceability.

### MCP Tools

- `epcis-query`
- `epcis-track-item`
- `epcis-capture`
- `epcis-capture-status`

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
- `GET /epcis/events/track` requires a non-empty `epc` query parameter.

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
