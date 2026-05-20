# Autonomous Revenue OS

Reproducible private revenue pipeline: load tasks from disk, dispatch DKG/MCP-style tools, audit every run, archive outcomes.

## Layout

```text
outputs/pending/     # incoming *.json tasks
outputs/done/        # successful runs (file moved here)
outputs/failed/      # failed runs (file moved here)
cursor_audit/        # timestamped audit JSON (gitignored)
scripts/
  autonomous_revenue_os.py
  revenue_adapters.py
  requirements-autonomous-revenue-os.txt
  requirements-autonomous-revenue-os-dev.txt
  tests/test_autonomous_revenue_os.py
```

## Prerequisites

1. DKG API on **:9200** — `node apps/agent/dist/index.js` (or `dkg-cli run-dev`)
2. DKG Publisher configured (`DKGP_DATABASE_URL`, Redis, MySQL) for real publishes
3. Python 3.11+ with `requests`
4. Optional auth: `DKG_AUTH_TOKEN` or `~/.dkg/auth.token`

Do **not** commit `.env`, tokens, wallet keys, or modify `~/.dkg/auth.token`.

## Install (venv recommended on macOS)

```bash
cd ~/work/my_dkg_node/dkg-node
python3 -m venv .venv-revenue-os
source .venv-revenue-os/bin/activate
pip install -r scripts/requirements-autonomous-revenue-os-dev.txt
```

## Task file format

`outputs/pending/my_task.json`:

```json
{
  "name": "publish_ai_asset",
  "params": {
    "source_id": "example-bundle-001",
    "name": "My AI Output",
    "privacy": "private"
  }
}
```

## CLI (safe defaults)

| Flag | Meaning |
|------|---------|
| *(none)* | **Dry-run** — process tasks, write audits, **no HTTP**, **no archive** |
| `--dry-run` | Same as default (explicit) |
| `--execute` | Run tools, HTTP where applicable, move files to `done/` or `failed/` |
| `--max-iterations N` | Process at most **N tasks** from `pending/` (default: `1`) |
| `--watch` | Repeat polling (off by default — no infinite loop unless you enable this) |
| `--metrics` | Print local + DKG queue metrics and exit |
| `--no-retries` | Single attempt per tool |
| `--skip-health` | Skip `GET /health` before execute |

## Examples

```bash
# Dry-run — audits written, files stay in pending/
python scripts/autonomous_revenue_os.py --dry-run --max-iterations 1

# Real publish (one task recommended first)
python scripts/autonomous_revenue_os.py --execute --max-iterations 1

# Queue snapshot
python scripts/autonomous_revenue_os.py --metrics

# Audit logs
ls cursor_audit/
```

### Example dry-run output

```text
DKG API: http://127.0.0.1:9200
Metrics: { "local": { "pending": 6, "done": 0, "failed": 0 }, ... }
[dry-run] get_billing_total (billing_task.json) -> ok=True
Final: { "local": { "pending": 6, ... } }
```

### Example execute output

```text
[execute] publish_ai_asset (publish_task.json) -> ok=True
          archived: .../outputs/done/publish_task.json
```

## Archiving workflow

1. Drop JSON into `outputs/pending/`
2. Run with `--execute`
3. On success → file moved to `outputs/done/`
4. On failure (unknown tool, HTTP error, dedicated stub tools) → `outputs/failed/`
5. Audit written to `cursor_audit/audit_<tool>_<ms>.json` on **every** task (dry-run and execute)

Re-run safety: executed files are no longer in `pending/`. Dry-run leaves files in place.

## MCP / tool dispatch

| Tool | Behavior |
|------|----------|
| `verify_and_anchor` | x402 adapter if `X402_API_URL` set; else local stub (`verified: true`) |
| `get_billing_total` | Nevermined adapter if `NEVERMINED_API_URL` set; else local stub |
| `publish_ai_asset` | **POST** `/api/dkg/assets` (30s timeout, retries) |
| `get_asset_status` | **GET** `/api/dkg/assets/status/:id` |
| `get_queue_metrics` | Local pending/done/failed + DKG `/api/dkg/metrics/queue` |
| `x402_adapter` | Returns `stub_not_implemented` unless `X402_API_URL` configured |
| `nevermined_adapter` | Returns `stub_not_implemented` unless `NEVERMINED_API_URL` set |
| `story_cdr_adapter` | Returns `stub_not_implemented` unless `STORY_CDR_API_URL` set |

## Stub adapters (env-configurable)

Set a base URL to call a real HTTP endpoint; leave unset for graceful stub failure on dedicated adapter tools.

| Variable | Adapter |
|----------|---------|
| `X402_API_URL` | x402 |
| `NEVERMINED_API_URL` | Nevermined |
| `STORY_CDR_API_URL` | Story / CDR |

Dedicated tools (`x402_adapter`, etc.) return:

```json
{ "ok": false, "error": "stub_not_implemented", "stub": true }
```

Pipeline tools (`verify_and_anchor`, `get_billing_total`) use local fallback values when the URL is unset so dry-runs and tests stay reproducible.

Optional per-adapter auth: `X402_AUTH_TOKEN`, `NEVERMINED_AUTH_TOKEN`, `STORY_CDR_AUTH_TOKEN`, or `ADAPTER_AUTH_TOKEN`.

## Environment

| Variable | Default |
|----------|---------|
| `DKG_API_URL` | `http://127.0.0.1:9200` |
| `DKG_AUTH_TOKEN` | read from `~/.dkg/auth.token` if unset |
| `DKG_HTTP_TIMEOUT` | `30` |
| `AUTONOMOUS_OS_MAX_RETRIES` | `5` |

## Testing

```bash
source .venv-revenue-os/bin/activate
pytest scripts/tests/test_autonomous_revenue_os.py -v
```

Covers dry-run audits, mocked publish, queue moves (`pending` → `done` / `failed`), and stub adapter errors.

## Verification

```bash
python scripts/autonomous_revenue_os.py --dry-run --max-iterations 1
ls cursor_audit/
curl -s http://127.0.0.1:9200/health
python scripts/autonomous_revenue_os.py --execute --max-iterations 1
```

## Safety

- Stub adapters fail gracefully; no secrets in repo.
- Do not edit `.env` or `~/.dkg/auth.token` from this script.
- Re-running dry-run on the same pending files produces new audit files with the same logical outcome.
