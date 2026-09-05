"""Tests for FastAPI HTTP endpoints and error handling."""

import pytest
from fastapi.testclient import TestClient
from src.schemas.safe_context import SafeContext


def test_health_endpoint(test_client: TestClient):
    """Verify /v1/health returns 200 and valid provider info."""
    response = test_client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "provider" in data
    assert "model" in data


def test_plan_endpoint_success(test_client: TestClient, sample_safe_context: SafeContext):
    """Verify /v1/plan returns valid ActionProposal envelope."""
    payload = {
        "requestId": "req_test_01",
        "safeContext": sample_safe_context.model_dump(),
    }
    response = test_client.post("/v1/plan", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "actionProposal" in data
    assert data["actionProposal"]["type"] in ["TYPE_TOKEN", "CLICK", "COMPLETE", "ASK_USER", "TYPE_TEXT", "PRESS_ENTER"]
    assert "metadata" in data
    assert data["metadata"]["requestId"] == "req_test_01"


def test_plan_endpoint_rejects_raw_scene(test_client: TestClient, sample_safe_context: SafeContext):
    """Verify /v1/plan rejects requests containing RawScene leaks."""
    dump = sample_safe_context.model_dump()
    dump["_isLocalOnly"] = True
    payload = {
        "requestId": "req_test_leak",
        "safeContext": dump,
    }
    response = test_client.post("/v1/plan", json=payload)
    assert response.status_code == 422  # Unprocessable Entity / Validation Error


def test_plan_endpoint_rejects_oversized_payload(test_client: TestClient, sample_safe_context: SafeContext):
    """Verify /v1/plan rejects payloads exceeding max byte limits."""
    # Create an excessively large element list
    huge_context = sample_safe_context.model_dump()
    huge_context["safeElements"] = [
        sample_safe_context.safeElements[0].model_dump() for _ in range(5000)
    ]
    payload = {
        "requestId": "req_huge",
        "safeContext": huge_context,
    }
    response = test_client.post("/v1/plan", json=payload)
    assert response.status_code in (413, 422)
