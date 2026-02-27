# 📘 EPCIS-DKG Integration Guide

This document explains all fields used in EPCIS 2.0 documents and provides comprehensive reference for integrating with the OriginTrail Decentralized Knowledge Graph (DKG).

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Document Structure](#2-document-structure)
3. [JSON-LD Context](#3-json-ld-context)
4. [Event Types](#4-event-types)
5. [Event Fields Reference](#5-event-fields-reference)
6. [Business Step (bizStep)](#6-business-step-bizstep)
7. [Disposition](#7-disposition)
8. [Business Transaction Types](#8-business-transaction-types)
9. [GS1 URN Schemes](#9-gs1-urn-schemes)
10. [API Reference](#10-api-reference)
11. [MCP Tools Reference](#11-mcp-tools-reference)
    - [Source Knowledge Assets](#source-knowledge-assets)
    - [Event Result Structure](#event-result-structure)
12. [Query Examples](#12-query-examples)
13. [Data Flow & DKG Publishing](#13-data-flow--dkg-publishing)
14. [Sample EPCIS Documents](#14-sample-epcis-documents)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Overview & Architecture

### What This System Does

This integration bridges **GS1 EPCIS 2.0** (Electronic Product Code Information Services) with the **OriginTrail Decentralized Knowledge Graph (DKG)**. It allows you to:

- **Capture** supply chain events in standard EPCIS format
- **Publish** them as tamper-proof Knowledge Assets on the DKG
- **Query** events using semantic filters across the distributed network

### Why Use DKG for EPCIS?

| Traditional EPCIS       | EPCIS + DKG                           |
| ----------------------- | ------------------------------------- |
| Centralized database    | Decentralized, permissionless network |
| Single point of failure | Replicated across multiple nodes      |
| Trust the provider      | Cryptographically verifiable          |
| Siloed data             | Interlinked Knowledge Graph           |
| Company-controlled      | Owned via blockchain (UAL)            |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                Your Application / AI Agent (MCP)                    │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ HTTP API                      │ MCP Tools
               │ POST /epcis/capture           │ epcis-query
               │ GET  /epcis/capture/:captureID │ epcis-track-item
               │ GET  /epcis/events            │ epcis-capture
               │ GET  /epcis/events/track      │ epcis-capture-status
               ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EPCIS Plugin                                  │
│  ┌─────────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │ Validation      │    │ Query Service│    │ Publisher Service│    │
│  │ (GS1 Schema)    │    │ (SPARQL)     │    │ (HTTP → DKG)    │     │
│  └────────┬────────┘    └──────┬───────┘    └────────┬─────────┘    │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
            │                     │ SPARQL SELECT       │ HTTP POST
            │                     ▼                     ▼
            │              ┌─────────────┐    ┌──────────────────┐
            │              │ DKG Graph   │    │ DKG Publisher    │
            │              │ (dkg.js)    │    │ (/api/dkg/assets)│
            │              └──────┬──────┘    └────────┬─────────┘
            │                     │                    │
            │                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              OriginTrail Decentralized Knowledge Graph              │
│                                                                     │
│   Knowledge Asset (UAL: did:dkg:otp/0x.../123456)                   │
│   ├── EPCIS Event Data (RDF/JSON-LD)                                │
│   ├── Cryptographic Proof (Blockchain anchored)                     │
│   └── Ownership (NFT)                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Document Structure

An EPCIS capture request consists of two main parts:

```json
{
  "epcisDocument": { ... },    // The EPCIS document wrapper
  "publishOptions": { ... }    // DKG publishing configuration (optional)
}
```

### epcisDocument Fields

| Field           | Example                  | Description                                     |
| --------------- | ------------------------ | ----------------------------------------------- |
| `@context`      | `{...}`                  | JSON-LD context for semantic interpretation     |
| `type`          | `"EPCISDocument"`        | Document type identifier (must be exactly this) |
| `schemaVersion` | `"2.0"`                  | EPCIS schema version                            |
| `creationDate`  | `"2024-03-01T08:00:00Z"` | When document was created (ISO 8601)            |
| `epcisBody`     | `{ eventList: [...] }`   | Container for event data                        |

### publishOptions Fields (DKG-specific)

| Field     | Example     | Default     | Description                                 |
| --------- | ----------- | ----------- | ------------------------------------------- |
| `privacy` | `"private"` | `"private"` | Asset visibility: `"private"` or `"public"` |
| `epochs`  | `12`        | `12`        | How many epochs to keep asset published     |

> Both fields are optional. When omitted, the defaults above are used.

---

## 3. JSON-LD Context

The `@context` defines JSON-LD namespaces for semantic interpretation. It is **extensible** - you can add custom namespaces for domain-specific vocabularies.

### Standard Context

```json
"@context": {
  "@vocab": "https://gs1.github.io/EPCIS/",
  "epcis": "https://gs1.github.io/EPCIS/",
  "cbv": "https://ref.gs1.org/cbv/",
  "type": "@type",
  "id": "@id"
}
```

| Key      | Purpose                                                    |
| -------- | ---------------------------------------------------------- |
| `@vocab` | Default namespace for unmapped terms                       |
| `epcis`  | EPCIS vocabulary namespace prefix                          |
| `cbv`    | Core Business Vocabulary namespace (GS1 standard values)   |
| `type`   | JSON-LD alias for `@type` (required for DKG compatibility) |
| `id`     | JSON-LD alias for `@id`                                    |

### Extended Context with Custom Namespaces

```json
"@context": {
  "@vocab": "https://gs1.github.io/EPCIS/",
  "epcis": "https://gs1.github.io/EPCIS/",
  "cbv": "https://ref.gs1.org/cbv/",
  "type": "@type",
  "id": "@id",

  "mycompany": "https://mycompany.com/ontology/",
  "schema": "https://schema.org/",
  "scor": "http://purl.org/ontology/scor#",
  "gr": "http://purl.org/goodrelations/v1#"
}
```

### Common Extension Namespaces

| Prefix    | Namespace                           | Purpose                           |
| --------- | ----------------------------------- | --------------------------------- |
| `schema`  | `https://schema.org/`               | General-purpose vocabulary        |
| `scor`    | `http://purl.org/ontology/scor#`    | Supply Chain Operations Reference |
| `gr`      | `http://purl.org/goodrelations/v1#` | E-commerce and business           |
| `foaf`    | `http://xmlns.com/foaf/0.1/`        | People and organizations          |
| `dcterms` | `http://purl.org/dc/terms/`         | Dublin Core metadata              |

> **Important:** Always include `"type": "@type"` in your context for DKG JSON-LD processing compatibility.

---

## 4. Event Types

EPCIS defines five event types, each serving a specific purpose in supply chain tracking:

| Event Type              | Purpose                       | Key Fields                        | Example Use Case                    |
| ----------------------- | ----------------------------- | --------------------------------- | ----------------------------------- |
| **ObjectEvent**         | Track individual objects      | `epcList`, `action`               | Receiving goods, quality inspection |
| **AggregationEvent**    | Parent-child relationships    | `parentID`, `childEPCs`, `action` | Packing items onto a pallet         |
| **TransactionEvent**    | Link to business transactions | `bizTransactionList`              | Purchase order fulfillment          |
| **TransformationEvent** | Input/output transformations  | `inputEPCList`, `outputEPCList`   | Manufacturing, assembly             |
| **AssociationEvent**    | Link assets together          | `parentID`, `childEPCs`           | Sensor attached to container        |

### Event Type Decision Guide

```
Is the item being created from other items?
├── YES → TransformationEvent (inputs → outputs)
└── NO
    ├── Are items being grouped/ungrouped?
    │   └── YES → AggregationEvent (parent-child)
    └── NO
        ├── Is this linked to a business document?
        │   └── YES → TransactionEvent
        └── NO → ObjectEvent (most common)
```

---

## 5. Event Fields Reference

### Core Event Identifiers

| Field                 | Example                      | Description                        |
| --------------------- | ---------------------------- | ---------------------------------- |
| `type`                | `"ObjectEvent"`              | Event type identifier              |
| `eventID`             | `"urn:uuid:event:001"`       | Unique event identifier (optional) |
| `eventTime`           | `"2024-03-01T08:00:00.000Z"` | When event occurred (ISO 8601)     |
| `eventTimeZoneOffset` | `"+00:00"`                   | Timezone offset from UTC           |

### What (Items Being Tracked)

#### For ObjectEvent

| Field     | Example                                    | Description                 |
| --------- | ------------------------------------------ | --------------------------- |
| `epcList` | `["urn:epc:id:sgtin:4012345.011111.1001"]` | List of EPCs being observed |
| `action`  | `"ADD"`                                    | Event action type           |

#### For AggregationEvent

| Field       | Example                                    | Description                         |
| ----------- | ------------------------------------------ | ----------------------------------- |
| `parentID`  | `"urn:epc:id:sscc:4012345.0000000001"`     | Container/parent EPC                |
| `childEPCs` | `["urn:epc:id:sgtin:4012345.099999.9001"]` | Items inside the container          |
| `action`    | `"ADD"`                                    | ADD (packing) or DELETE (unpacking) |

#### For TransformationEvent

| Field           | Example                    | Description         |
| --------------- | -------------------------- | ------------------- |
| `inputEPCList`  | `["urn:epc:id:sgtin:..."]` | Components consumed |
| `outputEPCList` | `["urn:epc:id:sgtin:..."]` | Products created    |

### Action Values

| Action    | Description                           | Use Case                                |
| --------- | ------------------------------------- | --------------------------------------- |
| `ADD`     | Objects entering the supply chain     | Commissioning, receiving, packing       |
| `OBSERVE` | Objects observed without state change | Scanning, tracking, inspection          |
| `DELETE`  | Objects leaving the supply chain      | Decommissioning, unpacking, destruction |

### Where (Location Fields)

| Field         | Example                                     | Description                  |
| ------------- | ------------------------------------------- | ---------------------------- |
| `readPoint`   | `{"id": "urn:epc:id:sgln:4012345.00001.0"}` | Specific scan/read location  |
| `bizLocation` | `{"id": "urn:epc:id:sgln:4012345.00001.0"}` | Business location (facility) |

**Difference:**

- `readPoint` = Where the scanner/reader is (specific station, dock door)
- `bizLocation` = Business context location (warehouse, production line, facility)

### Why (Business Context)

| Field                | Example                                       | Description               |
| -------------------- | --------------------------------------------- | ------------------------- |
| `bizStep`            | `"https://ref.gs1.org/cbv/BizStep-receiving"` | Business process step     |
| `disposition`        | `"https://ref.gs1.org/cbv/Disp-in_progress"`  | Current state/condition   |
| `bizTransactionList` | `[{type, bizTransaction}]`                    | Linked business documents |

---

## 6. Business Step (bizStep)

The `bizStep` field indicates what business process step is occurring. You can use either the full URI or shorthand (the API accepts both).

### Commissioning & Decommissioning

| BizStep           | Description                        |
| ----------------- | ---------------------------------- |
| `commissioning`   | Creating a new serialized instance |
| `decommissioning` | Removing from active use           |

### Manufacturing & Production

| BizStep       | Description                         |
| ------------- | ----------------------------------- |
| `assembling`  | Combining components into a product |
| `disassembly` | Breaking down into components       |
| `repairing`   | Fixing a defective item             |
| `repackaging` | Changing packaging                  |

### Warehousing & Logistics

| BizStep            | Description                  |
| ------------------ | ---------------------------- |
| `receiving`        | Goods arriving at a location |
| `shipping`         | Goods departing a location   |
| `storing`          | Placing into storage         |
| `picking`          | Retrieving from storage      |
| `packing`          | Placing into containers      |
| `unpacking`        | Removing from containers     |
| `loading`          | Loading onto transport       |
| `unloading`        | Unloading from transport     |
| `transporting`     | In transit                   |
| `staging_outbound` | Staged for shipping          |
| `arriving`         | Arriving at destination      |
| `departing`        | Leaving a location           |

### Quality & Compliance

| BizStep      | Description                |
| ------------ | -------------------------- |
| `inspecting` | Quality inspection         |
| `accepting`  | Accepting after inspection |
| `rejecting`  | Rejecting after inspection |
| `holding`    | Quarantine/hold status     |
| `releasing`  | Releasing from hold        |

### Retail & Commerce

| BizStep          | Description        |
| ---------------- | ------------------ |
| `retail_selling` | Point of sale      |
| `sampling`       | Taking samples     |
| `void_shipping`  | Voiding a shipment |

### Other

| BizStep            | Description          |
| ------------------ | -------------------- |
| `cycle_counting`   | Inventory count      |
| `destroying`       | Destruction of items |
| `encoding`         | RFID encoding        |
| `sensor_reporting` | Sensor data capture  |

**URI Format:** `https://ref.gs1.org/cbv/BizStep-{value}`

**Shorthand:** The API accepts just the step name (e.g., `"assembling"`) and expands it automatically.

---

## 7. Disposition

The `disposition` field indicates the current state/condition of objects.

### Process States

| Disposition   | Description               |
| ------------- | ------------------------- |
| `in_progress` | Currently being processed |
| `in_transit`  | Being transported         |
| `active`      | In active use             |
| `inactive`    | Not currently in use      |

### Container/Packaging States

| Disposition        | Description         |
| ------------------ | ------------------- |
| `container_open`   | Container is open   |
| `container_closed` | Container is sealed |

### Quality States

| Disposition         | Description             |
| ------------------- | ----------------------- |
| `conformant`        | Meets quality standards |
| `non_conformant`    | Does not meet standards |
| `needs_replacement` | Requires replacement    |
| `damaged`           | Physical damage         |
| `expired`           | Past expiration date    |

### Inventory States

| Disposition               | Description                   |
| ------------------------- | ----------------------------- |
| `available`               | Available for use/sale        |
| `unavailable`             | Not available                 |
| `reserved`                | Reserved for specific purpose |
| `sellable_accessible`     | Can be sold, accessible       |
| `sellable_not_accessible` | Can be sold, not accessible   |
| `non_sellable`            | Cannot be sold                |

### Special States

| Disposition | Description        |
| ----------- | ------------------ |
| `recalled`  | Subject to recall  |
| `returned`  | Returned item      |
| `stolen`    | Reported stolen    |
| `destroyed` | Has been destroyed |
| `disposed`  | Disposed of        |
| `encoded`   | RFID encoded       |
| `unknown`   | State unknown      |

**URI Format:** `https://ref.gs1.org/cbv/Disp-{value}`

---

## 8. Business Transaction Types

The `bizTransactionList` links events to business documents.

### Standard Transaction Types (CBV 2.0)

| Type Code   | Description                      | Example Use                 |
| ----------- | -------------------------------- | --------------------------- |
| `po`        | Purchase Order                   | Customer order              |
| `prodorder` | Production Order                 | Manufacturing work order    |
| `desadv`    | Despatch Advice                  | Shipping notification (ASN) |
| `recadv`    | Receiving Advice                 | Receipt confirmation        |
| `inv`       | Invoice                          | Billing document            |
| `rma`       | Return Merchandise Authorization | Return authorization        |
| `pedigree`  | Pedigree                         | Chain of custody            |
| `cert`      | Certificate                      | Quality certificate         |

**URI Format:** `https://ref.gs1.org/cbv/BTT-{type}`

**Example:**

```json
"bizTransactionList": [
  {
    "type": "https://ref.gs1.org/cbv/BTT-po",
    "bizTransaction": "urn:epc:id:gdti:4012345.00001.PO-2024-001"
  }
]
```

---

## 9. GS1 URN Schemes

GS1 URN (Uniform Resource Name) schemes provide globally unique identifiers for tracking items, locations, documents, and assets.

### Overview

| Scheme    | Full Name                           | Used For           | Granularity     |
| --------- | ----------------------------------- | ------------------ | --------------- |
| **SGTIN** | Serialized Global Trade Item Number | Individual items   | Unit level      |
| **LGTIN** | Lot/Batch GTIN                      | Batch/lot tracking | Batch level     |
| **SGLN**  | Serialized Global Location Number   | Locations          | Location level  |
| **SSCC**  | Serial Shipping Container Code      | Containers/pallets | Container level |
| **GRAI**  | Global Returnable Asset ID          | Reusable assets    | Asset level     |
| **GIAI**  | Global Individual Asset ID          | Fixed assets       | Asset level     |
| **GDTI**  | Global Document Type ID             | Documents          | Document level  |

---

### SGTIN - Serialized Global Trade Item Number

**Purpose:** Uniquely identify individual product instances (serialized items).

**Format:**

```
urn:epc:id:sgtin:{CompanyPrefix}.{ItemReference}.{SerialNumber}
```

**Breakdown (Bicycle Manufacturing Example):**

```
urn:epc:id:sgtin:4012345.011111.1001
                 └─────┘ └────┘ └──┘
                    │      │     │
                    │      │     └── Serial Number (unique instance: 1001)
                    │      └──────── Item Reference (product: carbon frame)
                    └─────────────── Company Prefix (Alpine Cycles: 4012345)
```

**Examples from Bicycle Manufacturing:**

| Item             | EPC                                    |
| ---------------- | -------------------------------------- |
| Carbon Frame     | `urn:epc:id:sgtin:4012345.011111.1001` |
| Front Wheel      | `urn:epc:id:sgtin:4012345.022222.2001` |
| Rear Wheel       | `urn:epc:id:sgtin:4012345.022222.2002` |
| Handlebar        | `urn:epc:id:sgtin:4012345.033333.3001` |
| Finished Bicycle | `urn:epc:id:sgtin:4012345.099999.9001` |

---

### SGLN - Serialized Global Location Number

**Purpose:** Identify physical locations (facilities, zones, stations).

**Format:**

```
urn:epc:id:sgln:{CompanyPrefix}.{LocationReference}.{Extension}
```

**Breakdown:**

```
urn:epc:id:sgln:4012345.00001.0
                └─────┘ └───┘ └┘
                   │      │    │
                   │      │    └── Extension (specific point, 0 = general)
                   │      └─────── Location Reference (area/zone)
                   └────────────── Company Prefix
```

**Examples from Bicycle Manufacturing:**

| Location       | EPC                               |
| -------------- | --------------------------------- |
| Receiving Dock | `urn:epc:id:sgln:4012345.00001.0` |
| Quality Lab    | `urn:epc:id:sgln:4012345.00002.0` |
| Assembly Line  | `urn:epc:id:sgln:4012345.00003.0` |
| Packing Area   | `urn:epc:id:sgln:4012345.00004.0` |
| Shipping Dock  | `urn:epc:id:sgln:4012345.00005.0` |

---

### SSCC - Serial Shipping Container Code

**Purpose:** Identify logistics units (pallets, containers, cases).

**Format:**

```
urn:epc:id:sscc:{CompanyPrefix}.{SerialReference}
```

**Example:**

```
urn:epc:id:sscc:4012345.0000000001
                └─────┘ └────────┘
                   │        │
                   │        └── Serial Reference (unique container ID)
                   └─────────── Company Prefix
```

**Use Cases:**
| Container Type | Example |
|----------------|---------|
| Shipping Pallet | `urn:epc:id:sscc:4012345.0000000001` |
| Cardboard Case | `urn:epc:id:sscc:4012345.CASE000123` |
| Shipping Container | `urn:epc:id:sscc:4012345.CONT456789` |

---

### GDTI - Global Document Type Identifier

**Purpose:** Identify business documents.

**Format:**

```
urn:epc:id:gdti:{CompanyPrefix}.{DocumentType}.{SerialNumber}
```

**Examples:**

| Document Type   | Example                                      |
| --------------- | -------------------------------------------- |
| Purchase Order  | `urn:epc:id:gdti:4012345.00001.PO-2024-001`  |
| Despatch Advice | `urn:epc:id:gdti:4012345.00001.ASN-2024-001` |
| Invoice         | `urn:epc:id:gdti:4012345.00001.INV-12345`    |

---

## 10. API Reference

### Authorization and required scopes

All EPCIS HTTP routes require a Bearer token in the `Authorization` header:

```http
Authorization: Bearer <access-token>
```

Scope requirements:

- `GET /epcis/events`, `GET /epcis/events/track` -> `epcis.read`
- `POST /epcis/capture`, `GET /epcis/capture/:captureID` -> `epcis.write`

For MCP usage, `/mcp` still requires `mcp`, and EPCIS tools additionally require:

- `epcis-query`, `epcis-track-item` -> `epcis.read`
- `epcis-capture`, `epcis-capture-status` -> `epcis.write`

Implementation note: EPCIS MCP tools keep standard `mcp.registerTool(...)` registration and enforce tool-level scopes by wrapping handlers with `withRequiredMcpScope(...)`.

### POST `/epcis/capture`

Accept an EPCIS Document and queue it for publishing to DKG.

**Request Body:**

```json
{
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
        /* array of events */
      ]
    }
  },
  "publishOptions": {
    "privacy": "private",
    "epochs": 12
  }
}
```

**Responses:**

| Status                        | When                      | Description                                                             |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| **401 Unauthorized**          | Missing/invalid token     | No valid Bearer token was provided                                      |
| **403 Forbidden**             | Missing `epcis.write`     | Token is valid but lacks required write scope                           |
| **202 Accepted**              | Document valid and queued | Capture forwarded to publisher; includes `captureID` for status polling |
| **400 Bad Request**           | Validation failed         | GS1 schema validation error or document contains no events              |
| **500 Internal Server Error** | Publisher unreachable     | Publisher service unavailable after retry attempts                      |

**Example (HTTP 202 Accepted):**

```json
{
  "status": "202",
  "requestId": "epcis-1709280001123-a1b2c3",
  "receivedAt": "2024-03-01T08:00:01.123Z",
  "captureID": "456",
  "eventCount": 1
}
```

> Poll `GET /epcis/capture/:captureID` with the returned `captureID` to track publishing progress and retrieve the UAL once published.

**Example (HTTP 400 Bad Request - Validation):**

```json
{
  "error": "Invalid EPCISDocument",
  "details": [
    "/epcisBody/eventList/0/eventTime: must match format \"date-time\""
  ]
}
```

**Example (HTTP 400 Bad Request - Empty Events):**

```json
{
  "error": "EPCISDocument contains no events",
  "message": "The EPCISDocument contains no events to publish. Please check the document and try again."
}
```

**Example (HTTP 500 Internal Server Error):**

```json
{
  "error": "Something went wrong with publishing the EPCIS document.",
  "message": "Something went wrong with publishing the EPCIS document. Check if the publisher service is available."
}
```

---

### GET `/epcis/capture/:captureID`

Check the status of a previously submitted capture tracked by the publisher.

> **Note:** `captureID` must be a numeric string matching the pattern `^[0-9]{1,20}$`.
> Use the numeric `captureID` returned from `POST /epcis/capture`.

**Responses:**

| Status                        | When                     | Description                                         |
| ----------------------------- | ------------------------ | --------------------------------------------------- |
| **401 Unauthorized**          | Missing/invalid token    | No valid Bearer token was provided                  |
| **403 Forbidden**             | Missing `epcis.write`    | Token is valid but lacks required write scope       |
| **200 OK**                    | Capture found            | Returns current status, optional UAL and timestamps |
| **404 Not Found**             | Unknown captureID        | No capture with this ID exists in the publisher     |
| **500 Internal Server Error** | Upstream publisher error | Unexpected publisher/status lookup failure          |
| **504 Gateway Timeout**       | Publisher timeout        | Publisher service did not respond in time           |

**Example (HTTP 200 OK):**

```json
{
  "status": "published",
  "captureID": "456",
  "UAL": "did:dkg:otp/0x1234.../789",
  "publishedAt": "2024-03-01T08:01:23.456Z"
}
```

**Example (Failed):**

```json
{
  "status": "failed",
  "captureID": "456",
  "error": "Wallet balance insufficient"
}
```

**Example (HTTP 500 Internal Server Error):**

```json
{
  "error": "Failed to get capture status"
}
```

| Status       | Description                                |
| ------------ | ------------------------------------------ |
| `pending`    | Registered but not yet queued              |
| `queued`     | Waiting to be published                    |
| `assigned`   | Assigned to a publishing wallet            |
| `publishing` | Currently being published to DKG           |
| `published`  | Successfully published (includes UAL)      |
| `failed`     | Publishing failed (includes error message) |

---

### GET `/epcis/events`

Query EPCIS events from the DKG using SPARQL.

**Validation Rules:**

- At least one filter parameter is required (excluding `fullTrace`, `limit`, `offset`)
- When both `from` and `to` are provided, `to` must be >= `from`
- Empty string values are rejected for all filter parameters
- Date parameters must be valid ISO 8601 datetime strings

**Query Parameters:**

| Parameter     | Type              | Description                                                         | Example                                |
| ------------- | ----------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `epc`         | string            | Filter by EPC identifier                                            | `urn:epc:id:sgtin:4012345.011111.1001` |
| `from`        | string (ISO 8601) | Start of time range                                                 | `2024-03-01T00:00:00Z`                 |
| `to`          | string (ISO 8601) | End of time range                                                   | `2024-03-31T23:59:59Z`                 |
| `bizStep`     | string            | Filter by business step                                             | `assembling` or full URI               |
| `bizLocation` | string            | Filter by location                                                  | `urn:epc:id:sgln:4012345.00002.0`      |
| `fullTrace`   | string enum       | `"true"` or `"false"` - search all EPC fields for full traceability | `"true"`                               |
| `parentID`    | string            | Filter by parent EPC (AggregationEvent)                             | `urn:epc:id:sscc:...`                  |
| `childEPC`    | string            | Filter by child EPC (AggregationEvent)                              | `urn:epc:id:sgtin:...`                 |
| `inputEPC`    | string            | Filter by input EPC (TransformationEvent)                           | `urn:epc:id:sgtin:...`                 |
| `outputEPC`   | string            | Filter by output EPC (TransformationEvent)                          | `urn:epc:id:sgtin:...`                 |
| `limit`       | integer           | Results per page (default: 100, range: 1-1000)                      | `50`                                   |
| `offset`      | integer           | Results to skip (pagination, min: 0)                                | `0`                                    |

**Responses:**

| Status                        | When                  | Description                                    |
| ----------------------------- | --------------------- | ---------------------------------------------- |
| **401 Unauthorized**          | Missing/invalid token | No valid Bearer token was provided             |
| **403 Forbidden**             | Missing `epcis.read`  | Token is valid but lacks required read scope   |
| **200 OK**                    | Query succeeded       | Returns matching events with pagination        |
| **400 Bad Request**           | Validation failed     | Missing filters, invalid date range, or params |
| **500 Internal Server Error** | DKG query failed      | Failed to execute SPARQL query against DKG     |

**Example (HTTP 200 OK):**

```json
{
  "success": true,
  "results": [
    {
      "ual": "did:dkg:otp:2043/0x.../1/private",
      "eventType": "https://gs1.github.io/EPCIS/ObjectEvent",
      "eventTime": "2024-03-01T08:00:00.000Z",
      "bizStep": "https://ref.gs1.org/cbv/BizStep-receiving",
      "bizLocation": "urn:epc:id:sgln:4012345.00001.0",
      "disposition": "https://ref.gs1.org/cbv/Disp-in_progress",
      "readPoint": "urn:epc:id:sgln:4012345.00001.0",
      "action": "ADD",
      "epcList": "urn:epc:id:sgtin:4012345.011111.1001"
    }
  ],
  "count": 1,
  "pagination": {
    "limit": 100,
    "offset": 0
  }
}
```

> Each result row includes a `ual` field identifying which Knowledge Asset graph the event was found in. Array fields (`epcList`, `childEPCList`, `inputEPCs`, `outputEPCs`) are returned as comma-separated strings.

**Example (HTTP 400 Bad Request):**

```json
{
  "error": "At least one filter parameter is required."
}
```

**Example (HTTP 500 Internal Server Error):**

```json
{
  "success": false,
  "error": "Failed to query events"
}
```

---

### GET `/epcis/events/track`

Track a single EPC through its full supply chain journey. This endpoint always performs a full-trace query across all EPC-relevant fields.

**Query Parameters:**

| Parameter | Type   | Required | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| `epc`     | string | **Yes**  | EPC identifier to track across all events |

**Responses:**

| Status                        | When                  | Description                                  |
| ----------------------------- | --------------------- | -------------------------------------------- |
| **401 Unauthorized**          | Missing/invalid token | No valid Bearer token was provided           |
| **403 Forbidden**             | Missing `epcis.read`  | Token is valid but lacks required read scope |
| **200 OK**                    | Query succeeded       | Returns matching events for EPC              |
| **400 Bad Request**           | Missing/invalid `epc` | Query validation failed                      |
| **500 Internal Server Error** | DKG query failed      | Failed to execute full-trace query           |

**Example (HTTP 200 OK):**

```json
{
  "success": true,
  "results": [
    {
      "ual": "did:dkg:otp:2043/0x.../6/private",
      "eventType": "https://gs1.github.io/EPCIS/TransformationEvent",
      "eventTime": "2024-03-01T14:00:00.000Z",
      "bizStep": "https://ref.gs1.org/cbv/BizStep-assembling",
      "bizLocation": "urn:epc:id:sgln:4012345.00003.0",
      "inputEPCs": "urn:epc:id:sgtin:4012345.011111.1001, urn:epc:id:sgtin:4012345.022222.2001",
      "outputEPCs": "urn:epc:id:sgtin:4012345.099999.9001"
    }
  ],
  "count": 1
}
```

**Example (HTTP 500 Internal Server Error):**

```json
{
  "success": false,
  "error": "Failed to query events"
}
```

---

## 11. MCP Tools Reference

The EPCIS plugin exposes four MCP (Model Context Protocol) tools that AI agents can use to capture, query, and track EPCIS supply chain data.

### `epcis-query` — Query EPCIS Events

General-purpose query tool with the same filtering capabilities as `GET /epcis/events`. Returns matching events with pagination and source Knowledge Asset provenance.

**Input Schema:**

| Parameter     | Type              | Required | Description                                            |
| ------------- | ----------------- | -------- | ------------------------------------------------------ |
| `epc`         | string            | No       | EPC identifier to filter by                            |
| `from`        | string (ISO 8601) | No       | Start of time range                                    |
| `to`          | string (ISO 8601) | No       | End of time range                                      |
| `bizStep`     | string            | No       | Business step (shorthand or full URI)                  |
| `bizLocation` | string            | No       | Business location URI                                  |
| `fullTrace`   | boolean           | No       | If `true`, search all EPC fields for full traceability |
| `parentID`    | string            | No       | Parent ID for AggregationEvent queries                 |
| `childEPC`    | string            | No       | Child EPC for AggregationEvent queries                 |
| `inputEPC`    | string            | No       | Input EPC for TransformationEvent queries              |
| `outputEPC`   | string            | No       | Output EPC for TransformationEvent queries             |
| `limit`       | integer           | No       | Results per page (default: 100, max: 1000)             |
| `offset`      | integer           | No       | Results to skip for pagination (default: 0)            |

> **Note:** At least one filter parameter is required (excluding `fullTrace`, `limit`, `offset`). Unlike the HTTP API where `fullTrace` is a string (`"true"`/`"false"`), the MCP tool accepts a native boolean.

**Response (first content block):**

```json
{
  "summary": "Found 3 EPCIS event(s)",
  "count": 3,
  "events": [
    {
      "ual": "did:dkg:otp:2043/0x.../1/private",
      "eventType": "https://gs1.github.io/EPCIS/ObjectEvent",
      "eventTime": "2024-03-01T08:00:00.000Z",
      "bizStep": "https://ref.gs1.org/cbv/BizStep-receiving",
      "bizLocation": "urn:epc:id:sgln:4012345.00001.0",
      "disposition": "https://ref.gs1.org/cbv/Disp-in_progress",
      "readPoint": "urn:epc:id:sgln:4012345.00001.0",
      "action": "ADD",
      "epcList": "urn:epc:id:sgtin:4012345.011111.1001"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0
  }
}
```

When results contain events from DKG Knowledge Assets, a second content block is appended with **Source Knowledge Asset** provenance (see [Source Knowledge Assets](#source-knowledge-assets)).

**Error cases:**

- No filter parameters → `{ "error": "At least one filter parameter is required." }`
- Invalid date range → `{ "error": "Parameter 'to' must be greater than or equal to 'from'." }`
- DKG query failure → `{ "error": "Query failed" }`

---

### `epcis-track-item` — Track Item Journey

Specialized tool for tracking a single item's complete journey through the supply chain. Automatically enables full traceability to find the item across all event types (observed, transformation input/output, aggregations). Returns events in chronological order.

**Input Schema:**

| Parameter | Type   | Required | Description                                                     |
| --------- | ------ | -------- | --------------------------------------------------------------- |
| `epc`     | string | **Yes**  | The EPC to track (e.g., `urn:epc:id:sgtin:0614141.107346.2017`) |

**Response (first content block):**

```json
{
  "summary": "Tracking: urn:epc:id:sgtin:4012345.011111.1001\nFound 4 event(s) in the supply chain.\n\nJourney Timeline:\n1. [2024-03-01T08:00:00.000Z] receiving @ urn:epc:id:sgln:4012345.00001.0\n2. [2024-03-01T10:00:00.000Z] inspecting @ urn:epc:id:sgln:4012345.00002.0\n3. [2024-03-01T14:00:00.000Z] assembling @ urn:epc:id:sgln:4012345.00003.0\n4. [2024-03-01T16:00:00.000Z] packing @ urn:epc:id:sgln:4012345.00004.0\n",
  "epc": "urn:epc:id:sgtin:4012345.011111.1001",
  "eventCount": 4,
  "events": [
    /* chronologically ordered event objects */
  ]
}
```

The `summary` field contains a human-readable timeline with numbered steps showing `[eventTime] bizStep @ location` for each event. When results are found, a second content block is appended with **Source Knowledge Asset** provenance (see [Source Knowledge Assets](#source-knowledge-assets)).

**Error cases:**

- DKG query failure → `{ "error": "Tracking failed" }`

---

### `epcis-capture` — Capture EPCIS Document

Validates an EPCIS document and queues it for publishing via the DKG publisher service.

**Input Schema:**

| Parameter        | Type   | Required | Description                                        |
| ---------------- | ------ | -------- | -------------------------------------------------- |
| `epcisDocument`  | object | **Yes**  | EPCIS 2.0 JSON-LD document                         |
| `publishOptions` | object | No       | Optional publishing settings (`privacy`, `epochs`) |

**Success Response:**

```json
{
  "captureID": "456",
  "requestId": "epcis-1709280001123-a1b2c3",
  "receivedAt": "2024-03-01T08:00:01.123Z",
  "eventCount": 1
}
```

**Error cases:**

- Validation error → `{ "error": "Invalid EPCISDocument", "details": ["..."] }`
- Empty events → `{ "error": "EPCISDocument contains no events", "message": "..." }`
- Publisher unavailable → `{ "error": "Something went wrong with publishing the EPCIS document.", "message": "..." }`

---

### `epcis-capture-status` — Get Capture Status

Checks the publisher-tracked status for a capture request by numeric `captureID`.

**Input Schema:**

| Parameter   | Type   | Required | Description                                                       |
| ----------- | ------ | -------- | ----------------------------------------------------------------- |
| `captureID` | string | **Yes**  | Numeric capture ID (`^[0-9]{1,20}$`) returned by capture handlers |

**Success Response:**

```json
{
  "status": "published",
  "captureID": "456",
  "UAL": "did:dkg:otp/0x1234.../789",
  "publishedAt": "2024-03-01T08:01:23.456Z"
}
```

> Fields `UAL`, `publishedAt`, and `error` are only present when applicable to the current status.

**Error cases:**

- Capture not found → `{ "error": "Capture not found", "captureID": "456" }`
- Publisher timeout → `{ "error": "Publisher timeout", "captureID": "456" }`
- Upstream failure → `{ "error": "Failed to get capture status", "captureID": "456" }`

---

## Source Knowledge Assets

MCP tool responses (`epcis-query` and `epcis-track-item`) include **Source Knowledge Asset provenance** when results are found. This is returned as a second MCP content block (markdown text) listing the unique Knowledge Assets that contained the matching events.

**Format:**

```
**Source Knowledge Assets:**
- **EPCIS ObjectEvent**: EPCIS Plugin
  [did:dkg:otp:2043/0x.../1](https://dkg.origintrail.io/explore?ual=did:dkg:otp:2043/0x.../1)
- **EPCIS TransformationEvent**: EPCIS Plugin
  [did:dkg:otp:2043/0x.../6](https://dkg.origintrail.io/explore?ual=did:dkg:otp:2043/0x.../6)
```

Each entry includes:

- **Title**: Derived from the event type (e.g., `EPCIS ObjectEvent`)
- **Issuer**: Always `"EPCIS Plugin"`
- **UAL**: The cleaned Knowledge Asset UAL (with `/private` or `/public` suffix removed), linked to the DKG Explorer

### Event Result Structure

SPARQL query results (from both the HTTP API and MCP tools) return events with the following fields:

| Field          | Description                                        | Example                                     |
| -------------- | -------------------------------------------------- | ------------------------------------------- |
| `ual`          | Knowledge Asset graph containing this event        | `did:dkg:otp:2043/0x.../1/private`          |
| `eventType`    | Full EPCIS event type URI                          | `https://gs1.github.io/EPCIS/ObjectEvent`   |
| `eventTime`    | When the event occurred (ISO 8601)                 | `2024-03-01T08:00:00.000Z`                  |
| `bizStep`      | Business step URI                                  | `https://ref.gs1.org/cbv/BizStep-receiving` |
| `bizLocation`  | Business location identifier                       | `urn:epc:id:sgln:4012345.00001.0`           |
| `disposition`  | Current state/condition URI                        | `https://ref.gs1.org/cbv/Disp-in_progress`  |
| `readPoint`    | Scan/read location identifier                      | `urn:epc:id:sgln:4012345.00001.0`           |
| `action`       | Event action (`ADD`, `OBSERVE`, `DELETE`)          | `ADD`                                       |
| `parentID`     | Parent EPC (AggregationEvent)                      | `urn:epc:id:sscc:4012345.0000000001`        |
| `epcList`      | Observed EPCs (comma-separated)                    | `urn:epc:id:sgtin:4012345.011111.1001`      |
| `childEPCList` | Child EPCs (comma-separated, AggregationEvent)     | `urn:epc:id:sgtin:4012345.099999.9001`      |
| `inputEPCs`    | Input EPCs (comma-separated, TransformationEvent)  | `urn:epc:id:sgtin:4012345.011111.1001, ...` |
| `outputEPCs`   | Output EPCs (comma-separated, TransformationEvent) | `urn:epc:id:sgtin:4012345.099999.9001`      |

> Array fields (`epcList`, `childEPCList`, `inputEPCs`, `outputEPCs`) are returned as comma-separated strings from the SPARQL `GROUP_CONCAT`. Fields that don't apply to a specific event type will be empty strings.

---

## 12. Query Examples

Set a token first (must include the scopes described above):

```bash
TOKEN="<your-access-token>"
```

### Track a Single Item's Journey

Use the dedicated track endpoint for full-trace item tracking:

```bash
curl "http://localhost:9200/epcis/events/track?epc=urn:epc:id:sgtin:4012345.011111.1001" \
  -H "Authorization: Bearer $TOKEN"
```

### Track All Events for a Product

Find all events where the carbon frame appears using the general query with full trace:

```bash
curl "http://localhost:9200/epcis/events?epc=urn:epc:id:sgtin:4012345.011111.1001&fullTrace=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Find All Receiving Events

```bash
curl "http://localhost:9200/epcis/events?bizStep=receiving"
```

### Find Events at Quality Lab

```bash
curl "http://localhost:9200/epcis/events?bizLocation=urn:epc:id:sgln:4012345.00002.0"
```

### Find Assembly Events in a Time Range

```bash
curl "http://localhost:9200/epcis/events?bizStep=assembling&from=2024-03-01T00:00:00Z&to=2024-03-01T23:59:59Z"
```

### Find What Was Packed onto a Pallet

```bash
curl "http://localhost:9200/epcis/events?parentID=urn:epc:id:sscc:4012345.0000000001"
```

### Find Transformation Events by Output

```bash
curl "http://localhost:9200/epcis/events?outputEPC=urn:epc:id:sgtin:4012345.099999.9001"
```

---

## 13. Data Flow & DKG Publishing

### Publishing Pipeline

```
1. CAPTURE REQUEST
   └─▶ EPCIS Plugin validates against GS1 EPCIS 2.0 JSON Schema
   └─▶ Assigns internal requestId (epcis-{timestamp}-{random})

2. FORWARD TO PUBLISHER (HTTP POST)
   └─▶ Sends JSON-LD content to DKG Publisher (/api/dkg/assets)
   └─▶ Includes metadata (source: "EPCIS", sourceId: requestId)
   └─▶ Includes publishOptions (privacy, epochs)
   └─▶ Retries up to 3 times with exponential backoff on failure

3. PUBLISHER QUEUING
   └─▶ Publisher registers asset with status "pending" → "queued"
   └─▶ Returns numeric captureID for status tracking

4. PUBLISHER PROCESSING
   └─▶ Asset assigned to publishing wallet ("assigned")
   └─▶ Wraps content as JSON-LD Knowledge Asset ("publishing")
   └─▶ Calls dkg.js asset.create()

5. DKG NETWORK
   └─▶ Content replicated to DKG nodes
   └─▶ Cryptographic proof anchored to blockchain
   └─▶ UAL (NFT) minted for ownership

6. COMPLETION
   └─▶ Asset status updated to "published"
   └─▶ UAL stored for future queries via GET /epcis/capture/:captureID
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

## 14. Sample EPCIS Documents

### ObjectEvent - Receiving Goods

Carbon fiber frame arrives from supplier:

```json
{
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
}
```

### ObjectEvent - Quality Inspection

Frame passes quality check:

```json
{
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
    "creationDate": "2024-03-01T10:00:00Z",
    "epcisBody": {
      "eventList": [
        {
          "type": "ObjectEvent",
          "eventTime": "2024-03-01T10:00:00.000Z",
          "eventTimeZoneOffset": "+00:00",
          "epcList": ["urn:epc:id:sgtin:4012345.011111.1001"],
          "action": "OBSERVE",
          "bizStep": "https://ref.gs1.org/cbv/BizStep-inspecting",
          "disposition": "https://ref.gs1.org/cbv/Disp-conformant",
          "readPoint": { "id": "urn:epc:id:sgln:4012345.00002.0" },
          "bizLocation": { "id": "urn:epc:id:sgln:4012345.00002.0" }
        }
      ]
    }
  }
}
```

### TransformationEvent - Assembly

Components assembled into finished bicycle:

```json
{
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
    "creationDate": "2024-03-01T14:00:00Z",
    "epcisBody": {
      "eventList": [
        {
          "type": "TransformationEvent",
          "eventTime": "2024-03-01T14:00:00.000Z",
          "eventTimeZoneOffset": "+00:00",
          "inputEPCList": [
            "urn:epc:id:sgtin:4012345.011111.1001",
            "urn:epc:id:sgtin:4012345.022222.2001",
            "urn:epc:id:sgtin:4012345.022222.2002",
            "urn:epc:id:sgtin:4012345.033333.3001"
          ],
          "outputEPCList": ["urn:epc:id:sgtin:4012345.099999.9001"],
          "bizStep": "https://ref.gs1.org/cbv/BizStep-assembling",
          "disposition": "https://ref.gs1.org/cbv/Disp-active",
          "readPoint": { "id": "urn:epc:id:sgln:4012345.00003.0" },
          "bizLocation": { "id": "urn:epc:id:sgln:4012345.00003.0" }
        }
      ]
    }
  }
}
```

### AggregationEvent - Packing

Bicycle packed onto shipping pallet:

```json
{
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
    "creationDate": "2024-03-01T16:00:00Z",
    "epcisBody": {
      "eventList": [
        {
          "type": "AggregationEvent",
          "eventTime": "2024-03-01T16:00:00.000Z",
          "eventTimeZoneOffset": "+00:00",
          "parentID": "urn:epc:id:sscc:4012345.0000000001",
          "childEPCs": ["urn:epc:id:sgtin:4012345.099999.9001"],
          "action": "ADD",
          "bizStep": "https://ref.gs1.org/cbv/BizStep-packing",
          "disposition": "https://ref.gs1.org/cbv/Disp-in_transit",
          "readPoint": { "id": "urn:epc:id:sgln:4012345.00004.0" },
          "bizLocation": { "id": "urn:epc:id:sgln:4012345.00004.0" }
        }
      ]
    }
  }
}
```

### ObjectEvent - Shipping

Pallet shipped to customer:

```json
{
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
    "creationDate": "2024-03-02T08:00:00Z",
    "epcisBody": {
      "eventList": [
        {
          "type": "ObjectEvent",
          "eventTime": "2024-03-02T08:00:00.000Z",
          "eventTimeZoneOffset": "+00:00",
          "epcList": ["urn:epc:id:sscc:4012345.0000000001"],
          "action": "OBSERVE",
          "bizStep": "https://ref.gs1.org/cbv/BizStep-shipping",
          "disposition": "https://ref.gs1.org/cbv/Disp-in_transit",
          "readPoint": { "id": "urn:epc:id:sgln:4012345.00005.0" },
          "bizLocation": { "id": "urn:epc:id:sgln:4012345.00005.0" },
          "bizTransactionList": [
            {
              "type": "https://ref.gs1.org/cbv/BTT-desadv",
              "bizTransaction": "urn:epc:id:gdti:4012345.00001.ASN-2024-001"
            }
          ]
        }
      ]
    }
  }
}
```

---

## Event Flow Visualization

**Bicycle Manufacturing Supply Chain:**

```
Event 1: Receive Frame       (receiving, in_progress)      @ Receiving Dock
    ↓
Event 2: Receive Wheels      (receiving, in_progress)      @ Receiving Dock
    ↓
Event 3: Receive Handlebar   (receiving, in_progress)      @ Receiving Dock
    ↓
Event 4: Inspect Frame       (inspecting, conformant)      @ Quality Lab
    ↓
Event 5: Inspect Wheels      (inspecting, conformant)      @ Quality Lab
    ↓
Event 6: Assemble Bicycle    (assembling, active)          @ Assembly Line
         [TRANSFORMATION: 4 inputs → 1 output]
    ↓
Event 7: Final QC            (inspecting, conformant)      @ Quality Lab
    ↓
Event 8: Pack on Pallet      (packing, in_transit)         @ Packing Area
         [AGGREGATION: bicycle → pallet]
    ↓
Event 9: Ship                (shipping, in_transit)        @ Shipping Dock
```

---

## 15. Troubleshooting

### Common Errors

| Error                                        | Cause                                              | Solution                                                                                                                |
| -------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Invalid EPCISDocument`                      | GS1 schema validation failed                       | Check your JSON matches EPCIS 2.0 spec; `details` array shows specific issues                                           |
| `EPCISDocument contains no events`           | eventList is empty                                 | Add at least one event to `epcisBody.eventList`                                                                         |
| `Invalid captureID format`                   | captureID not numeric (must match `^[0-9]{1,20}$`) | Use the numeric ID from capture response                                                                                |
| `Capture not found` (404)                    | Unknown captureID                                  | Verify the ID exists in the publisher                                                                                   |
| `Publisher timeout` (504)                    | Publisher service did not respond                  | Publisher service may be overloaded; retry later                                                                        |
| `Something went wrong with publishing` (500) | Publisher unreachable after 3 retries              | Check that `EXPO_PUBLIC_MCP_URL` is set and the publisher is running                                                    |
| `At least one filter parameter is required`  | Query with no filters                              | Provide at least one of: `epc`, `from`, `to`, `bizStep`, `bizLocation`, `parentID`, `childEPC`, `inputEPC`, `outputEPC` |
| `Parameter 'to' must be >= 'from'`           | Invalid date range                                 | Ensure `to` date is not before `from` date                                                                              |
| `Parameter 'x' cannot be empty`              | Empty string query parameter                       | Provide a value or omit the parameter entirely                                                                          |

### Validation Errors

The system validates against the official GS1 EPCIS 2.0 JSON Schema. Common issues:

1. **Missing `@context`** - Must include EPCIS context with `type: @type` alias
2. **Invalid `eventTime`** - Must be ISO 8601 format (e.g., `2024-01-01T00:00:00Z`)
3. **Wrong `type`** - Must be exactly `"EPCISDocument"` (case-sensitive)
4. **Invalid `bizStep`** - Must be valid CBV URI or shorthand

### Environment Variables

| Variable              | Required | Description                                                           |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `EXPO_PUBLIC_MCP_URL` | Yes      | Base URL of the DKG publisher service (e.g., `http://localhost:9200`) |

### Checking System Health

- **Swagger UI**: Visit `/swagger` for interactive API documentation
- **Publisher Dashboard**: Visit `/admin/queues` to monitor publishing jobs
- **Server Logs**: Check for detailed error messages

---

## Custom Extensions

You can add custom fields using your own namespace:

```json
{
  "@context": {
    "@vocab": "https://gs1.github.io/EPCIS/",
    "type": "@type",
    "id": "@id",
    "mycompany": "https://mycompany.com/ontology/"
  },
  "type": "ObjectEvent",
  "eventTime": "2024-03-01T10:00:00.000Z",
  "epcList": ["urn:epc:id:sgtin:4012345.011111.1001"],
  "action": "OBSERVE",
  "bizStep": "https://ref.gs1.org/cbv/BizStep-inspecting",

  "mycompany:inspectorId": "EMP-12345",
  "mycompany:testEquipment": "MACHINE-QC-03",
  "mycompany:qualityScore": 98.5,
  "mycompany:testDurationSeconds": 120
}
```

---

## References

- [EPCIS 2.0 Standard](https://ref.gs1.org/standards/epcis/)
- [Core Business Vocabulary (CBV) 2.0](https://ref.gs1.org/standards/cbv/)
- [GS1 Digital Link](https://www.gs1.org/standards/gs1-digital-link)
- [JSON-LD 1.1 Specification](https://www.w3.org/TR/json-ld11/)
- [OriginTrail DKG Documentation](https://docs.origintrail.io/)

---

_Last updated: February 2026_  
_For API details, see the interactive [Swagger documentation](/swagger)_
