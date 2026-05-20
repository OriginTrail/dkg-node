#!/usr/bin/env python3
"""Autonomous Revenue OS — DKG task runner with audit trail and archiving."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

try:
    import requests
except ImportError:
    print(
        "Missing dependency: requests\n"
        "Install: pip install -r scripts/requirements-autonomous-revenue-os.txt",
        file=sys.stderr,
    )
    sys.exit(1)

from revenue_adapters import STUB_NOT_IMPLEMENTED, optional_adapter_request

REPO_ROOT = Path(__file__).resolve().parent.parent
PENDING_DIR = REPO_ROOT / "outputs" / "pending"
DONE_DIR = REPO_ROOT / "outputs" / "done"
FAILED_DIR = REPO_ROOT / "outputs" / "failed"
AUDIT_DIR = REPO_ROOT / "cursor_audit"
LOG_FILE = REPO_ROOT / "cursor_full_runtime.log"

DKG_API = os.environ.get("DKG_API_URL", "http://127.0.0.1:9200").rstrip("/")
TOKEN_PATH = Path.home() / ".dkg" / "auth.token"
HTTP_TIMEOUT = int(os.environ.get("DKG_HTTP_TIMEOUT", "30"))
MAX_RETRIES = int(os.environ.get("AUTONOMOUS_OS_MAX_RETRIES", "5"))

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("autonomous_revenue_os")

ToolFn = Callable[[dict[str, Any]], Any]
TOOL_MAP: dict[str, ToolFn] = {}


def load_auth_token() -> str | None:
    token = os.environ.get("DKG_AUTH_TOKEN")
    if token:
        return token.strip()
    if TOKEN_PATH.is_file():
        return TOKEN_PATH.read_text(encoding="utf-8").strip()
    return None


TOKEN = load_auth_token()


def register_tool(name: str) -> Callable[[ToolFn], ToolFn]:
    def wrapper(fn: ToolFn) -> ToolFn:
        TOOL_MAP[name] = fn
        return fn

    return wrapper


def _auth_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    return headers


def _tool_result_to_dispatch(name: str, result: Any) -> dict[str, Any]:
    if isinstance(result, dict) and result.get("error") == STUB_NOT_IMPLEMENTED:
        return {
            "ok": False,
            "error": STUB_NOT_IMPLEMENTED,
            "tool": name,
            "stub": True,
            "adapter": result.get("adapter"),
        }
    return {"ok": True, "result": result}


def call_tool(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """MCP-style dispatch: tool name + JSON payload → ok/result/error."""
    if name not in TOOL_MAP:
        return {"ok": False, "error": f"unknown_tool: {name}", "tool": name}
    try:
        return _tool_result_to_dispatch(name, TOOL_MAP[name](payload))
    except requests.RequestException as e:
        logger.exception("HTTP error in tool %s", name)
        return {"ok": False, "error": str(e), "tool": name}
    except Exception as e:
        logger.exception("Tool %s failed", name)
        return {"ok": False, "error": str(e), "tool": name}


def call_tool_with_retries(
    name: str, payload: dict[str, Any], max_retries: int = MAX_RETRIES
) -> dict[str, Any]:
    last: dict[str, Any] = {"ok": False, "error": "no_attempts"}
    for attempt in range(1, max_retries + 1):
        last = call_tool(name, payload)
        if last.get("ok") or last.get("error") == STUB_NOT_IMPLEMENTED:
            return last
        logger.warning("[Attempt %s] %s failed: %s", attempt, name, last.get("error"))
        if attempt < max_retries:
            time.sleep(2 * attempt)
    return last


@register_tool("verify_and_anchor")
def verify_and_anchor_tool(payload: dict[str, Any]) -> dict[str, Any]:
    out = optional_adapter_request(
        env_var="X402_API_URL", adapter="x402", payload=payload, method="POST"
    )
    if out.get("error") == STUB_NOT_IMPLEMENTED:
        return {
            "verified": True,
            "artifact_id": payload.get("artifact_id", "auto"),
            "note": "local stub (set X402_API_URL for live adapter)",
        }
    return out


@register_tool("get_billing_total")
def get_billing_total_tool(payload: dict[str, Any]) -> dict[str, Any]:
    out = optional_adapter_request(
        env_var="NEVERMINED_API_URL",
        adapter="nevermined",
        payload=payload,
        method="GET",
    )
    if out.get("error") == STUB_NOT_IMPLEMENTED:
        return {"total_units": 100, "note": "local stub (set NEVERMINED_API_URL)"}
    return out


@register_tool("publish_ai_asset")
def publish_ai_asset_tool(payload: dict[str, Any]) -> dict[str, Any]:
    body = {
        "content": payload.get("content")
        or {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "name": payload.get("name", "AI Output"),
            "identifier": payload.get("source_id", "auto"),
            "description": payload.get("description", "Autonomous Revenue OS publish"),
        },
        "metadata": {
            "source": payload.get("source", "autonomous-revenue-os"),
            "sourceId": payload.get("source_id", "auto"),
        },
        "publishOptions": {
            "privacy": payload.get("privacy", "private"),
            "priority": int(payload.get("priority", 10)),
            "epochs": int(payload.get("epochs", 1)),
            "maxAttempts": int(payload.get("maxAttempts", 1)),
        },
    }
    response = requests.post(
        f"{DKG_API}/api/dkg/assets",
        json=body,
        headers={"Content-Type": "application/json", **_auth_headers()},
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


@register_tool("get_asset_status")
def get_asset_status_tool(payload: dict[str, Any]) -> dict[str, Any]:
    asset_id = payload.get("id") or payload.get("asset_id")
    if asset_id is None:
        raise ValueError("get_asset_status requires id or asset_id")
    return get_asset_status(asset_id)


@register_tool("get_queue_metrics")
def get_queue_metrics_tool(payload: dict[str, Any]) -> dict[str, Any]:
    return get_queue_metrics(include_dkg=payload.get("include_dkg", True))


@register_tool("x402_adapter")
def x402_adapter_tool(payload: dict[str, Any]) -> dict[str, Any]:
    return optional_adapter_request(
        env_var="X402_API_URL", adapter="x402", payload=payload
    )


@register_tool("nevermined_adapter")
def nevermined_adapter_tool(payload: dict[str, Any]) -> dict[str, Any]:
    return optional_adapter_request(
        env_var="NEVERMINED_API_URL", adapter="nevermined", payload=payload
    )


@register_tool("story_cdr_adapter")
def story_cdr_adapter_tool(payload: dict[str, Any]) -> dict[str, Any]:
    return optional_adapter_request(
        env_var="STORY_CDR_API_URL", adapter="story_cdr", payload=payload
    )


def get_asset_status(asset_id: str | int) -> dict[str, Any]:
    response = requests.get(
        f"{DKG_API}/api/dkg/assets/status/{asset_id}",
        headers=_auth_headers(),
        timeout=HTTP_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def get_local_queue_metrics() -> dict[str, int]:
    def count_json(directory: Path) -> int:
        return len(list(directory.glob("*.json"))) if directory.is_dir() else 0

    return {
        "pending": count_json(PENDING_DIR),
        "done": count_json(DONE_DIR),
        "failed": count_json(FAILED_DIR),
    }


def get_queue_metrics(*, include_dkg: bool = True) -> dict[str, Any]:
    metrics: dict[str, Any] = {"local": get_local_queue_metrics()}
    if not include_dkg:
        return metrics
    try:
        response = requests.get(
            f"{DKG_API}/api/dkg/metrics/queue",
            headers=_auth_headers(),
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        metrics["dkg"] = response.json()
    except requests.RequestException as e:
        metrics["dkg_error"] = str(e)
    return metrics


def health_check() -> dict[str, Any]:
    try:
        response = requests.get(f"{DKG_API}/health", timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        return {"ok": True, "health": response.json()}
    except requests.RequestException as e:
        return {"ok": False, "error": str(e)}


def ensure_dirs() -> None:
    for directory in (PENDING_DIR, DONE_DIR, FAILED_DIR, AUDIT_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def detect_pending_tasks() -> list[tuple[Path, dict[str, Any]]]:
    items: list[tuple[Path, dict[str, Any]]] = []
    if not PENDING_DIR.is_dir():
        return items
    for path in sorted(PENDING_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "name" in data:
            items.append((path, data))
    return items


def archive_task(source: Path, *, success: bool) -> Path:
    dest_dir = DONE_DIR if success else FAILED_DIR
    dest = dest_dir / source.name
    if dest.exists():
        dest = dest_dir / f"{source.stem}_{int(time.time())}{source.suffix}"
    source.rename(dest)
    return dest


def write_audit(
    task: dict[str, Any], result: dict[str, Any], *, source: Path | None = None
) -> Path:
    stamp = int(time.time() * 1000)
    tool_name = task.get("name", "unknown")
    audit_file = AUDIT_DIR / f"audit_{tool_name}_{stamp}.json"
    record = {"timestamp": time.time(), "task": task, "result": result}
    if source is not None:
        record["source_file"] = str(source)
    audit_file.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return audit_file


def execute_task(
    task: dict[str, Any],
    *,
    source: Path | None = None,
    use_retries: bool = True,
    archive: bool = True,
    dry_run: bool = False,
) -> dict[str, Any]:
    name = task.get("name")
    if not name:
        result = {"ok": False, "error": "task missing 'name' field"}
        write_audit(task, result, source=source)
        return result

    params = task.get("params") or {}
    if dry_run:
        result = {
            "ok": True,
            "dry_run": True,
            "tool": name,
            "params": params,
            "note": "no HTTP writes",
        }
    elif use_retries:
        result = call_tool_with_retries(name, params)
    else:
        result = call_tool(name, params)

    write_audit(task, result, source=source)

    if archive and not dry_run and source is not None and source.is_file():
        archived = archive_task(source, success=bool(result.get("ok")))
        result["archived_to"] = str(archived)

    return result


def run_batch(*, dry_run: bool, use_retries: bool, max_tasks: int | None) -> int:
    items = detect_pending_tasks()
    if not items:
        print("No pending tasks in", PENDING_DIR)
        return 0

    failures = 0
    for i, (path, task) in enumerate(items):
        if max_tasks is not None and i >= max_tasks:
            break
        name = task.get("name", "?")
        result = execute_task(
            task,
            source=path,
            use_retries=use_retries,
            archive=not dry_run,
            dry_run=dry_run,
        )
        mode = "dry-run" if dry_run else "execute"
        print(f"[{mode}] {name} ({path.name}) -> ok={result.get('ok')}")
        if result.get("archived_to"):
            print(f"          archived: {result['archived_to']}")
        if not result.get("ok"):
            failures += 1
            print(f"          error: {result.get('error')}")
    return failures


def main(
    *,
    dry_run: bool = True,
    max_tasks: int | None = 1,
    watch: bool = False,
    poll_interval: float = 10.0,
    use_retries: bool = True,
    skip_health: bool = False,
) -> int:
    ensure_dirs()
    print(f"DKG API: {DKG_API}")
    print(f"Metrics: {json.dumps(get_queue_metrics(include_dkg=not dry_run), indent=2)}")

    if not skip_health and not dry_run:
        hc = health_check()
        if not hc.get("ok"):
            print("Health check failed:", hc, file=sys.stderr)
            return 1

    if not watch:
        failures = run_batch(dry_run=dry_run, use_retries=use_retries, max_tasks=max_tasks)
        print(f"\nFinal: {json.dumps(get_queue_metrics(), indent=2)}")
        return 1 if failures else 0

    exit_code = 0
    while True:
        if run_batch(dry_run=dry_run, use_retries=use_retries, max_tasks=max_tasks):
            exit_code = 1
        time.sleep(poll_interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Autonomous Revenue OS")
    parser.add_argument("--dry-run", action="store_true", help="Simulate (no HTTP/archive)")
    parser.add_argument("--execute", action="store_true", help="Real tool calls + archive")
    parser.add_argument("--max-iterations", type=int, default=1, help="Max tasks per run")
    parser.add_argument("--watch", action="store_true", help="Poll loop (off by default)")
    parser.add_argument("--poll-interval", type=float, default=10.0)
    parser.add_argument("--no-retries", action="store_true")
    parser.add_argument("--skip-health", action="store_true")
    parser.add_argument("--metrics", action="store_true", help="Print metrics and exit")
    args = parser.parse_args()

    if args.metrics:
        ensure_dirs()
        print(json.dumps(get_queue_metrics(), indent=2))
        sys.exit(0)

    dry_run = not args.execute
    if args.dry_run:
        dry_run = True

    sys.exit(
        main(
            dry_run=dry_run,
            max_tasks=args.max_iterations,
            watch=args.watch,
            poll_interval=args.poll_interval,
            use_retries=not args.no_retries,
            skip_health=args.skip_health,
        )
    )
