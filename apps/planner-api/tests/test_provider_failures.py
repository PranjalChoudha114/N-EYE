"""Planner gateway failure classification: 429 / 404 / 503 / schema."""

import pytest
from fastapi.testclient import TestClient
from src.adapters.base import ProviderConfigError, ProviderError, ProviderRateLimitError, ProviderSchemaError
from src.schemas.safe_context import SafeContext
import src.main as main_module


class _ScriptedAdapter:
    def __init__(self, error: Exception):
        self._error = error

    def get_provider_name(self) -> str:
        return "scripted"

    def get_model_name(self) -> str:
        return "scripted-model"

    async def propose(self, context: SafeContext, request_id: str):
        raise self._error


def _plan(client: TestClient, ctx: SafeContext):
    return client.post("/v1/plan", json={"requestId": "req_fail", "safeContext": ctx.model_dump()})


def test_rate_limit_returns_429_and_retry_after(test_client: TestClient, sample_safe_context: SafeContext):
    original = main_module.adapter
    main_module.adapter = _ScriptedAdapter(ProviderRateLimitError("limited", retry_after_seconds=2))
    try:
        response = _plan(test_client, sample_safe_context)
        assert response.status_code == 429
        assert response.headers.get("retry-after") == "2"
        assert "rate limit" in response.json()["detail"].lower()
        assert "CANARY_PASSWORD" not in response.text
    finally:
        main_module.adapter = original


def test_misconfigured_returns_404(test_client: TestClient, sample_safe_context: SafeContext):
    original = main_module.adapter
    main_module.adapter = _ScriptedAdapter(ProviderConfigError())
    try:
        response = _plan(test_client, sample_safe_context)
        assert response.status_code == 404
    finally:
        main_module.adapter = original


def test_retryable_provider_error_returns_503(test_client: TestClient, sample_safe_context: SafeContext):
    original = main_module.adapter
    main_module.adapter = _ScriptedAdapter(ProviderError("upstream", is_retryable=True))
    try:
        response = _plan(test_client, sample_safe_context)
        assert response.status_code == 503
        assert "Upstream AI provider error." in response.json()["detail"]
    finally:
        main_module.adapter = original


def test_schema_error_returns_502_without_raw_output(test_client: TestClient, sample_safe_context: SafeContext):
    original = main_module.adapter
    main_module.adapter = _ScriptedAdapter(ProviderSchemaError("secret-looking parse dump"))
    try:
        response = _plan(test_client, sample_safe_context)
        assert response.status_code == 502
        assert "secret-looking" not in response.text
    finally:
        main_module.adapter = original


def test_malformed_surrogate_in_title_does_not_crash_plan(test_client: TestClient, sample_safe_context: SafeContext):
    dumped = sample_safe_context.model_dump()
    dumped["pageMetadata"]["sanitizedTitle"] = "YouTube " + chr(0xD83D)
    dumped["sanitizedGoal"] = "Play the video"
    import json

    body = json.dumps({"requestId": "req_uni", "safeContext": dumped}, ensure_ascii=True).encode("utf-8")
    response = test_client.post("/v1/plan", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 200
    assert "actionProposal" in response.json()
