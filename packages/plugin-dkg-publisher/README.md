# DKG Publisher Plugin

Enterprise-grade plugin for publishing JSON-LD knowledge assets to the OriginTrail Decentralized Knowledge Graph (DKG).

## Overview

The DKG Publisher plugin provides a **production-ready, scalable system** for publishing knowledge assets to the OriginTrail DKG. It handles high-volume publishing with automatic concurrency management, retry logic, and comprehensive monitoring.

## Key Features

- 🚀 **Automatic Concurrency** - Self-configures based on wallet pool size
- 🔄 **Intelligent Queue System** - 2-tier architecture (Database + BullMQ/Redis)
- 💾 **Persistent Storage** - All assets tracked in MySQL database
- 🔐 **Wallet Pool Management** - Atomic locking prevents conflicts
- 📊 **Real-time Dashboard** - Monitor jobs at `/admin/queues`
- 🛡️ **Built-in Retry Logic** - Automatic retry with exponential backoff
- 🏥 **Health Monitoring** - Auto-recovery from stuck jobs
- 📈 **Hot Reload** - Add wallets without restarting

## Quick Start

### 1. Setup

```bash
cd apps/agent
npm run script:setup
```

The standard node setup now owns Publisher configuration too. Choose async
publishing during the Agent setup flow to write the consolidated Publisher
runtime env into `apps/agent/.env` and provision the Publisher MySQL database.

`npm run setup` in this package remains as a legacy compatibility path for older
workflows that still rely on `.env.publisher`.

### 2. Start the Application

The plugin runs automatically when you start your DKG Agent:

```bash
npm run dev
```

The system will:

- Connect to database and Redis
- Start configured number of workers
- Auto-calculate optimal concurrency from wallet count
- Begin processing queued assets

### 3. Publish Assets

**Import the Postman Collection:**

All API endpoints with complete examples are available in:

```
[LOCAL] DKG Node - Publisher.postman_collection.json
```

Import this collection into Postman to test all endpoints with pre-configured requests and examples.

## Architecture

### How It Works

```
User Request → Database (Tier 1: Persistent Queue)
                ↓
         QueuePoller (polls every 2s)
                ↓
         Checks wallet availability
                ↓
         BullMQ (Tier 2: Fast Distribution)
                ↓
         Workers process jobs → Publish to DKG
                ↓
         Update database with results
```

### Concurrency Model

The system automatically manages concurrency based on your wallet pool:

- **Wallet count** = Hard concurrency limit (each wallet processes 1 asset at a time)
- **Worker concurrency** = Auto-calculated: `⌈wallets ÷ workers⌉`
- **Example**: 10 wallets, 2 workers → 5 concurrency per worker

### Asset Status Flow

```
pending → queued → assigned → publishing → published ✅
                                    ↓
                                 failed ❌ (with retry)
```

### Adding Wallets

**During setup:**

```bash
npm run setup
# Choose option 3: "Add wallets only"
```

**After 5 minutes**, workers automatically restart with new concurrency. No application restart needed!

## Monitoring

### Dashboard

Access the Bull Board dashboard at:

```
http://localhost:9200/admin/queues
```

### Health Check

```bash
curl http://localhost:9200/api/dkg/metrics/wallets
```

Response:

```json
{
  "total": 10,
  "available": 3,
  "inUse": 7,
  "avgUsage": 42.5
}
```

**Interpretation:**

- `available = 0` → All wallets busy (add more wallets or reduce load)
- `available > 5` → Excess capacity (can handle more load)

## Database Schema

### Core Tables

- **`assets`** - All knowledge assets (status, metadata, results)
- **`wallets`** - Wallet pool with locking mechanism
- **`publishing_attempts`** - Complete audit trail
- **`batches`** - Batch operation tracking TBD
- **`metrics_hourly`** - Aggregated metrics TBD

### Asset Tracking

Every asset transition is recorded:

- `queued_at` - When added to queue
- `assigned_at` - When worker claimed it
- `publishing_started_at` - When DKG publish began
- `published_at` - When successfully published

## Retry Logic

- **Max attempts**: 3 (configurable per asset)
- **Strategy**: Exponential backoff
- **Behavior**:
  - Retry #1: Immediate re-queue
  - Retry #2: Re-queue after 2 seconds
  - Retry #3: Re-queue after 4 seconds
  - After 3 failures → Permanent `failed` status

## Performance Tuning

### Optimal Configuration

```bash
# For high throughput
WORKER_COUNT=10
# Add 50-100 wallets to database

# For moderate load
WORKER_COUNT=5
# Add 10-20 wallets

# For testing
WORKER_COUNT=1
# Add 2-5 wallets
```

### Scaling Guidelines

| Wallets | Workers | Expected Throughput       |
| ------- | ------- | ------------------------- |
| 10      | 5       | ~10 concurrent publishes  |
| 50      | 10      | ~50 concurrent publishes  |
| 100     | 10      | ~100 concurrent publishes |
