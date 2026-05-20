"""HTTP adapters for Autonomous Revenue OS (x402, Nevermined, Story/CDR)."""

from __future__ import annotations

import os
from typing import Any

import requests

STUB_NOT_IMPLEMENTED = "stub_not_implemented"
HTTP_TIMEOUT = int(os.environ.get("DKG_HTTP_TIMEOUT", "30"))


def optional_adapter_request(
    *,
    env_var: str,
    adapter: str,
    payload: dict[str, Any],
    method: str = "POST",
) -> dict[str, Any]:
    """Call adapter URL from env, or return stub_not_implemented."""
    url = os.environ.get(env_var, "").strip()
    if not url:
        return {"error": STUB_NOT_IMPLEMENTED, "adapter": adapter}

    headers = {"Content-Type": "application/json"}
    token = os.environ.get(f"{adapter.upper()}_AUTH_TOKEN") or os.environ.get(
        "ADAPTER_AUTH_TOKEN"
    )
    if token:
        headers["Authorization"] = f"Bearer {token.strip()}"

    if method.upper() == "GET":
        response = requests.get(url, params=payload, headers=headers, timeout=HTTP_TIMEOUT)
    else:
        response = requests.post(url, json=payload, headers=headers, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    if response.content:
        return response.json()
    return {"status": response.status_code, "adapter": adapter}
