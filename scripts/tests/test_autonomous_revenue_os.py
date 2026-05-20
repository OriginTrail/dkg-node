"""Tests for Autonomous Revenue OS (dry-run, mocks, audit, queue)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_SCRIPTS = Path(__file__).resolve().parent.parent
_REPO = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import autonomous_revenue_os as os_mod  # noqa: E402
from revenue_adapters import STUB_NOT_IMPLEMENTED  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    pending = tmp_path / "pending"
    done = tmp_path / "done"
    failed = tmp_path / "failed"
    audit = tmp_path / "audit"
    for d in (pending, done, failed, audit):
        d.mkdir()
    monkeypatch.setattr(os_mod, "PENDING_DIR", pending)
    monkeypatch.setattr(os_mod, "DONE_DIR", done)
    monkeypatch.setattr(os_mod, "FAILED_DIR", failed)
    monkeypatch.setattr(os_mod, "AUDIT_DIR", audit)
    monkeypatch.setattr(os_mod, "LOG_FILE", tmp_path / "runtime.log")
    yield {"pending": pending, "done": done, "failed": failed, "audit": audit}


def _write_task(pending: Path, name: str, params: dict | None = None) -> Path:
    path = pending / f"task_{name}.json"
    path.write_text(
        json.dumps({"name": name, "params": params or {}}),
        encoding="utf-8",
    )
    return path


class TestCoreFunctionality:
    def test_dry_run_writes_audit_no_archive(self, isolated_dirs):
        pending = isolated_dirs["pending"]
        audit = isolated_dirs["audit"]
        _write_task(pending, "get_billing_total")

        result = os_mod.execute_task(
            {"name": "get_billing_total", "params": {}},
            source=pending / "task_get_billing_total.json",
            dry_run=True,
            archive=True,
        )

        assert result.get("ok") is True
        assert result.get("dry_run") is True
        assert (pending / "task_get_billing_total.json").is_file()
        audits = list(audit.glob("audit_*.json"))
        assert len(audits) == 1
        record = json.loads(audits[0].read_text())
        assert record["task"]["name"] == "get_billing_total"

    def test_verify_and_anchor_stub(self):
        out = os_mod.call_tool("verify_and_anchor", {"artifact_id": "x"})
        assert out["ok"] is True
        assert out["result"]["verified"] is True

    def test_get_billing_total_stub(self):
        out = os_mod.call_tool("get_billing_total", {})
        assert out["ok"] is True
        assert "total_units" in out["result"]

    @patch("autonomous_revenue_os.requests.post")
    def test_publish_ai_asset_mock(self, mock_post: MagicMock):
        mock_post.return_value = MagicMock(
            status_code=200,
            raise_for_status=MagicMock(),
            json=MagicMock(return_value={"id": 42, "status": "queued"}),
        )
        out = os_mod.call_tool(
            "publish_ai_asset",
            {"source_id": "test-001", "name": "Test Asset"},
        )
        assert out["ok"] is True
        assert out["result"]["id"] == 42
        mock_post.assert_called_once()

    def test_queue_pending_to_done(self, isolated_dirs):
        pending = isolated_dirs["pending"]
        done = isolated_dirs["done"]
        path = _write_task(pending, "get_billing_total")

        result = os_mod.execute_task(
            {"name": "get_billing_total", "params": {}},
            source=path,
            dry_run=False,
            use_retries=False,
            archive=True,
        )

        assert result.get("ok") is True
        assert not path.is_file()
        assert len(list(done.glob("*.json"))) == 1

    def test_run_batch_max_iterations(self, isolated_dirs):
        pending = isolated_dirs["pending"]
        _write_task(pending, "get_billing_total")
        _write_task(pending, "verify_and_anchor")

        failures = os_mod.run_batch(dry_run=True, use_retries=False, max_tasks=1)
        assert failures == 0
        assert len(list(pending.glob("*.json"))) == 2


class TestErrorHandling:
    def test_unknown_tool(self, isolated_dirs):
        audit = isolated_dirs["audit"]
        result = os_mod.execute_task({"name": "nonexistent_tool"}, dry_run=False)
        assert result.get("ok") is False
        assert "unknown_tool" in result.get("error", "")
        assert len(list(audit.glob("audit_*.json"))) == 1

    def test_stub_adapter_returns_not_ok_dispatch(self):
        out = os_mod.call_tool("x402_adapter", {"foo": "bar"})
        assert out["ok"] is False
        assert out["error"] == STUB_NOT_IMPLEMENTED

    @patch("autonomous_revenue_os.requests.post")
    def test_publish_failure_archives_to_failed(
        self, mock_post: MagicMock, isolated_dirs
    ):
        mock_post.side_effect = os_mod.requests.Timeout("timed out")
        pending = isolated_dirs["pending"]
        failed = isolated_dirs["failed"]
        path = _write_task(pending, "publish_ai_asset", {"source_id": "fail-1"})

        result = os_mod.execute_task(
            {"name": "publish_ai_asset", "params": {"source_id": "fail-1"}},
            source=path,
            dry_run=False,
            use_retries=False,
            archive=True,
        )

        assert result.get("ok") is False
        assert not path.is_file()
        assert len(list(failed.glob("*.json"))) == 1
