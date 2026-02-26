# 📘 EPCIS-DKG Integration Guide

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Quick Start](#2-quick-start)
3. [EPCIS Event Types Explained](#3-epcis-event-types-explained)
4. [API Reference](#4-api-reference)
5. [Data Flow & DKG Publishing](#5-data-flow--dkg-publishing)
6. [Query Examples](#6-query-examples)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview & Architecture

### What This System Does

This integration bridges **GS1 EPCIS 2.0** (Electronic Product Code Information Services) with the **OriginTrail Decentralized Knowledge Graph (DKG)**. It allows you to:

- **Capture** supply chain events in standard EPCIS format
- **Publish** them as tamper-proof Knowledge Assets on the DKG
- **Query** events using semantic filters across the distributed network

### Why Use DKG for EPCIS?

| Traditional EPCIS | EPCIS + DKG |
|-------------------|-------------|
| Centralized database | Decentralized, permissionless network |
| Single point of failure | Replicated across multiple nodes |
| Trust the provider | Cryptographically verifiable |
| Siloed data | Interlinked Knowledge Graph |
| Company-controlled | Owned via blockchain (UAL) |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Application                             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP POST /epcis/capture
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EPCIS Plugin                                   │
│  ┌─────────────────┐    ┌──────────────────┐                        │
│  │ Validation      │───▶│ JSON-LD Transform │                       │
│  │ (GS1 Schema)    │    │ (EPCIS Context)   │                       │
│  └─────────────────┘    └────────┬─────────┘                        │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DKG Publisher Plugin                              │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐         │
│  │ Asset Queue │───▶│ BullMQ      │───▶│ DKG Network      │         │
│  │ (MySQL)     │    │ Workers     │    │ (via dkg.js)     │         │
│  └─────────────┘    └─────────────┘    └────────┬─────────┘         │
└─────────────────────────────────────────────────┼───────────────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              OriginTrail Decentralized Knowledge Graph               │
│                                                                      │
│   Knowledge Asset (UAL: did:dkg:otp/0x.../123456)                   │
│   ├── EPCIS Event Data (RDF/JSON-LD)                                │
│   ├── Cryptographic Proof (Blockchain anchored)                      │
│   └── Ownership (NFT)                                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Quick Start

### Prerequisites

- DKG Node running (with EPCIS and Publisher plugins enabled)
- Access to the API endpoint (default: `http://localhost:9200`)

### Step 1: Send Your First EPCIS Event

```bash
curl -X POST http://localhost:9200/epcis/capture \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {
      "@vocab": "https://gs1.github.io/EPCIS/",
      "epcis": "https://gs1.github.io/EPCIS/",
      "cbv": "https://ref.gs1.org/cbv/",
      "type": "@type",
      "id": "@id",
      "epcisBody": "epcis:epcisBody",
      "eventList": "epcis:eventList"
    },
    "type": "EPCISDocument",
    "schemaVersion": "2.0",
    "creationDate": "2024-01-01T00:00:00Z",
    "epcisBody": {
      "eventList": [{
        "type": "ObjectEvent",
        "eventTime": "2024-01-01T00:00:00.000Z",
        "eventTimeZoneOffset": "+00:00",
        "epcList": ["urn:epc:id:sgtin:0614141.107346.2017"],
        "action": "OBSERVE",
        "bizStep": "https://ref.gs1.org/cbv/BizStep-receiving",
        "disposition": "https://ref.gs1.org/cbv/Disp-in_progress",
        "readPoint": {"id": "urn:epc:id:sgln:0614141.00001.0"},
        "bizLocation": {"id": "urn:epc:id:sgln:0614141.00001.0"}
      }]
    }
  }'
```

### Step 2: Check Status

The response includes a `captureID`. Use it to check publishing status:

```bash
curl http://localhost:9200/epcis/capture/123
```

Possible statuses:

- `queued` - Waiting to be published
- `processing` - Currently being published to DKG
- `published` - Successfully published (includes UAL)
- `failed` - Publishing failed (includes error message)

### Step 3: Query Events

Once published, query events from the DKG:

```bash
# By EPC
curl "http://localhost:9200/epcis/events?epc=urn:epc:id:sgtin:0614141.107346.2017"

# By time range
curl "http://localhost:9200/epcis/events?from=2024-01-01T00:00:00Z&to=2024-12-31T23:59:59Z"

# By business step
curl "http://localhost:9200/epcis/events?bizStep=inspecting"
```

> 💡 **Interactive Documentation**: For detailed request/response schemas and to test the API live, visit the Swagger UI at `/swagger`

---

## 3. EPCIS Event Types Explained

### What is EPCIS?

EPCIS (Electronic Product Code Information Services) is a GS1 standard for capturing and sharing supply chain events. It answers the "what, where, when, and why" of products moving through a supply chain.

### The Five Event Types

| Event Type | Purpose | Example Use Case |
|------------|---------|------------------|
| **ObjectEvent** | Track individual items | Product inspection, quality check |
| **AggregationEvent** | Items grouped/ungrouped | Packing items into a case |
| **TransactionEvent** | Business transactions | Purchase order, invoice |
| **TransformationEvent** | Input→Output conversion | Manufacturing, assembly |
| **AssociationEvent** | Link assets together | Sensor attached to container |

### Action Types

- **ADD** - New item introduced (e.g., manufactured, received)
- **OBSERVE** - Item observed without state change (e.g., scanned at checkpoint)
- **DELETE** - Item removed from tracking (e.g., sold, destroyed)

### Business Steps (bizStep)

Common GS1 CBV (Core Business Vocabulary) business steps:

| bizStep | Description |
|---------|-------------|
| `receiving` | Goods received at a location |
| `shipping` | Goods shipped from a location |
| `inspecting` | Quality inspection performed |
| `assembling` | Components assembled into product |
| `packing` | Items packed for shipment |
| `commissioning` | New serial assigned (e.g., manufacturing) |
| `decommissioning` | Serial number retired |

> **Shorthand supported**: You can use just `"assembling"` instead of the full URI `"https://ref.gs1.org/cbv/BizStep-assembling"`

---

## 4. API Reference

### Understanding the JSON-LD Context

EPCIS documents use JSON-LD (Linked Data) format. The `@context` object maps terms to URIs for proper semantic interpretation:

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "epcis": "https://gs1.github.io/EPCIS/",
    "cbv": "https://ref.gs1.org/cbv/",
    "type": "@type",
    "id": "@id",
    "epcisBody": "epcis:epcisBody",
    "eventList": "epcis:eventList"
  }
}
```

| Key | Purpose |
|-----|---------|
| `@vocab` | Default namespace for unmapped terms |
| `epcis` | EPCIS vocabulary namespace |
| `cbv` | GS1 Core Business Vocabulary |
| `type` / `id` | Maps to JSON-LD keywords |
| `epcisBody`, `eventList` | Explicit term mappings |

> **Note**: You can also use the shorthand `["https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld"]` but the explicit context above gives you more control and  is properly tested.

---

### POST `/epcis/capture`

Accept an EPCIS Document and queue it for publishing to DKG.

**Request Body**: EPCISDocument (JSON-LD)

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "epcis": "https://gs1.github.io/EPCIS/",
    "cbv": "https://ref.gs1.org/cbv/",
    "type": "@type",
    "id": "@id",
    "epcisBody": "epcis:epcisBody",
    "eventList": "epcis:eventList"
  },
  "type": "EPCISDocument",
  "schemaVersion": "2.0",
  "creationDate": "2024-01-01T00:00:00Z",
  "epcisBody": {
    "eventList": [/* array of events */]
  }
}
```

**Response** (HTTP 202 Accepted):

```json
{
  "status": "202",
  "receivedAt": "2024-01-01T00:00:01.123Z",
  "captureID": "456",
  "eventCount": 1
}
```

---

### GET `/epcis/capture/:captureID`

Check the status of a previously submitted capture.

**Response**:

```json
{
  "status": "published",
  "captureID": "456",
  "UAL": "did:dkg:otp/0x1234.../789",
  "publishedAt": "2024-01-01T00:01:23.456Z"
}
```

| Field | Description |
|-------|-------------|
| `status` | `queued` / `processing` / `published` / `failed` |
| `UAL` | Uniform Asset Locator (only when published) |
| `error` | Error message (only when failed) |

---

### GET `/epcis/events`

Query EPCIS events from the DKG.

**Query Parameters**:

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `epc` | string | Filter by EPC identifier | `urn:epc:id:sgtin:0614141.107346.2017` |
| `from` | string (ISO 8601) | Start of time range | `2024-01-01T00:00:00Z` |
| `to` | string (ISO 8601) | End of time range | `2024-12-31T23:59:59Z` |
| `bizStep` | string | Filter by business step | `assembling` or full URI |
| `bizLocation` | string | Filter by location | `urn:epc:id:sgln:0614141.00001.0` |
| `ual` | string | Get specific event by UAL | `did:dkg:otp/...` |

**Response**:

```json
{
  "success": true,
  "query": "SELECT ...",
  "results": [/* array of matching events */],
  "count": 5
}
```

---

## 5. Data Flow & DKG Publishing

### Publishing Pipeline

```
1. CAPTURE REQUEST
   └─▶ Validate against GS1 EPCIS 2.0 JSON Schema
   
2. QUEUE (Tier 1 - MySQL)
   └─▶ Asset registered with status "queued"
   └─▶ Assigned priority and metadata
   
3. POLLING (every 2 seconds)
   └─▶ QueuePoller checks for available wallets
   └─▶ Moves jobs to BullMQ (Tier 2 - Redis)
   
4. PROCESSING (BullMQ Workers)
   └─▶ Worker acquires wallet lock
   └─▶ Wraps content as JSON-LD Knowledge Asset
   └─▶ Calls dkg.js asset.create()
   
5. DKG NETWORK
   └─▶ Content replicated to DKG nodes
   └─▶ Cryptographic proof anchored to blockchain
   └─▶ UAL (NFT) minted for ownership
   
6. COMPLETION
   └─▶ Asset status updated to "published"
   └─▶ UAL stored for future queries
```

### What is a UAL?

A **Uniform Asset Locator** is a globally unique identifier for your Knowledge Asset:

```
did:dkg:otp/0x1234567890abcdef/123456
└──┬──┘ └┬┘ └────────┬───────┘ └──┬──┘
   │     │           │            │
   │     │           │            └── Asset ID
   │     │           └── Contract address
   │     └── Blockchain (otp = OriginTrail Parachain)
   └── DID method
```

With a UAL, you can:

- **Verify** the content hasn't been tampered with
- **Prove** ownership on the blockchain
- **Query** the event data from any DKG node
- **Link** to other Knowledge Assets

---

## 6. Query Examples

### Find All Events for a Product

```bash
curl "http://localhost:9200/epcis/events?epc=urn:epc:id:sgtin:0614141.107346.2017"
```

### Find Assembly Events at a Specific Location

```bash
curl "http://localhost:9200/epcis/events?bizStep=assembling&bizLocation=urn:epc:id:sgln:0614141.00001.0"
```

### Get Full Event Details by UAL

```bash
curl "http://localhost:9200/epcis/events?ual=did:dkg:otp/0x1234.../789"
```

### Time Range Query

```bash
curl "http://localhost:9200/epcis/events?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z"
```

### SPARQL Direct Query

Under the hood, queries are translated to SPARQL. Example generated query:

```sparql
PREFIX epcis: <https://gs1.github.io/EPCIS/>
PREFIX schema: <http://schema.org/>

SELECT ?ual ?eventType ?eventTime ?epc ?bizStep ?disposition ?readPoint ?bizLocation
WHERE {
  GRAPH ?ual {
    ?event a ?eventType .
    ?event epcis:epcList "urn:epc:id:sgtin:0614141.107346.2017" .
    OPTIONAL { ?event epcis:bizStep ?bizStep . }
    OPTIONAL { ?event epcis:eventTime ?eventTime . }
  }
  FILTER(STRSTARTS(STR(?eventType), "https://gs1.github.io/EPCIS/"))
}
ORDER BY DESC(?eventTime)
LIMIT 100
```

---

## 7. Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid EPCISDocument` | Schema validation failed | Check your JSON matches EPCIS 2.0 spec |
| `Invalid captureID format` | Non-numeric captureID | Use the numeric ID from capture response |
| `Capture not found` | Unknown captureID | Verify the ID; it may have been deleted |
| `Publishing failed` | DKG network error | Check wallet balance, node connectivity |
| `No available wallets` | All wallets are busy | Wait or add more wallets to the pool |

### Checking System Health

**Publisher Dashboard**: Visit `/admin/queues` to see:

- Active jobs
- Waiting queue
- Failed jobs with error details
- Worker status

**API Health**: The Swagger UI at `/swagger` shows all available endpoints and their status.

### Validation Errors

The system validates against the official GS1 EPCIS 2.0 JSON Schema. Common issues:

1. **Missing `@context`** - Must include EPCIS context
2. **Invalid `eventTime`** - Must be ISO 8601 format
3. **Wrong `type`** - Must be exactly `"EPCISDocument"` (case-sensitive)
4. **Invalid `bizStep`** - Must be valid CBV URI or shorthand

### Getting Help

- **Swagger UI**: `http://your-server/swagger` - Interactive API docs
- **OpenAPI Spec**: `http://your-server/openapi` - Raw JSON spec
- **Logs**: Check server logs for detailed error messages

---

## Appendix: Sample EPCIS Documents

### Object Event (Receiving Goods)

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "epcis": "https://gs1.github.io/EPCIS/",
    "cbv": "https://ref.gs1.org/cbv/",
    "type": "@type",
    "id": "@id",
    "epcisBody": "epcis:epcisBody",
    "eventList": "epcis:eventList"
  },
  "type": "EPCISDocument",
  "schemaVersion": "2.0",
  "creationDate": "2024-01-01T00:00:00Z",
  "epcisBody": {
    "eventList": [{
      "type": "ObjectEvent",
      "eventTime": "2024-01-01T00:00:00.000Z",
      "eventTimeZoneOffset": "+00:00",
      "epcList": ["urn:epc:id:sgtin:0614141.107346.2017"],
      "action": "OBSERVE",
      "bizStep": "https://ref.gs1.org/cbv/BizStep-receiving",
      "disposition": "https://ref.gs1.org/cbv/Disp-in_progress",
      "readPoint": {"id": "urn:epc:id:sgln:0614141.00001.0"},
      "bizLocation": {"id": "urn:epc:id:sgln:0614141.00001.0"},
      "bizTransactionList": [
        {
          "type": "urn:epcglobal:cbv:btt:po",
          "bizTransaction": "urn:epc:id:gdti:0614141.00001.1234"
        }
      ]
    }]
  }
}
```

### Transformation Event (Assembly)

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "epcis": "https://gs1.github.io/EPCIS/",
    "cbv": "https://ref.gs1.org/cbv/",
    "type": "@type",
    "id": "@id",
    "epcisBody": "epcis:epcisBody",
    "eventList": "epcis:eventList"
  },
  "type": "EPCISDocument",
  "schemaVersion": "2.0",
  "creationDate": "2024-01-01T00:00:00Z",
  "epcisBody": {
    "eventList": [{
      "type": "TransformationEvent",
      "eventTime": "2024-01-01T12:00:00.000Z",
      "eventTimeZoneOffset": "+00:00",
      "inputEPCList": [
        "urn:epc:id:sgtin:0614141.107346.001",
        "urn:epc:id:sgtin:0614141.107346.002"
      ],
      "outputEPCList": [
        "urn:epc:id:sgtin:0614141.107347.001"
      ],
      "bizStep": "https://ref.gs1.org/cbv/BizStep-assembling",
      "bizLocation": {"id": "urn:epc:id:sgln:0614141.00002.0"}
    }]
  }
}
```

### Aggregation Event (Packing)

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "epcis": "https://gs1.github.io/EPCIS/",
    "cbv": "https://ref.gs1.org/cbv/",
    "type": "@type",
    "id": "@id",
    "epcisBody": "epcis:epcisBody",
    "eventList": "epcis:eventList"
  },
  "type": "EPCISDocument",
  "schemaVersion": "2.0",
  "creationDate": "2024-01-01T00:00:00Z",
  "epcisBody": {
    "eventList": [{
      "type": "AggregationEvent",
      "eventTime": "2024-01-01T14:00:00.000Z",
      "eventTimeZoneOffset": "+00:00",
      "parentID": "urn:epc:id:sscc:0614141.0000000001",
      "childEPCs": [
        "urn:epc:id:sgtin:0614141.107346.001",
        "urn:epc:id:sgtin:0614141.107346.002",
        "urn:epc:id:sgtin:0614141.107346.003"
      ],
      "action": "ADD",
      "bizStep": "https://ref.gs1.org/cbv/BizStep-packing",
      "bizLocation": {"id": "urn:epc:id:sgln:0614141.00001.0"}
    }]
  }
}
```

### Object Event with Sensor Data

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "epcis": "https://gs1.github.io/EPCIS/",
    "cbv": "https://ref.gs1.org/cbv/",
    "type": "@type",
    "id": "@id",
    "epcisBody": "epcis:epcisBody",
    "eventList": "epcis:eventList"
  },
  "type": "EPCISDocument",
  "schemaVersion": "2.0",
  "creationDate": "2024-01-01T00:00:00Z",
  "epcisBody": {
    "eventList": [{
      "type": "ObjectEvent",
      "eventTime": "2024-01-01T08:00:00.000Z",
      "eventTimeZoneOffset": "+00:00",
      "epcList": ["urn:epc:id:sgtin:0614141.107346.2017"],
      "action": "OBSERVE",
      "bizStep": "https://ref.gs1.org/cbv/BizStep-inspecting",
      "disposition": "https://ref.gs1.org/cbv/Disp-conformant",
      "readPoint": {"id": "urn:epc:id:sgln:0614141.00001.0"},
      "bizLocation": {"id": "urn:epc:id:sgln:0614141.00001.0"},
      "sensorElementList": [
        {
          "sensorReport": [
            {
              "type": "https://gs1.org/voc/MeasurementType-Temperature",
              "time": "2024-01-01T08:00:00.000Z",
              "value": 23.5,
              "uom": "CEL"
            }
          ]
        }
      ]
    }]
  }
}
```

---

*Last updated: January 2026*  
*For API details, see the interactive [Swagger documentation](/swagger)*

