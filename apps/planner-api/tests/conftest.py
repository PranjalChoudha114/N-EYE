"""Test fixtures and helpers for planner-api test suites."""

import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.schemas.safe_context import (
    BoundingBox,
    PageMetadata,
    SafeContext,
    SafeElement,
    TokenCapability,
    Viewport,
)


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.fixture
def sample_safe_context() -> SafeContext:
    return SafeContext(
        protocolVersion="1.0.0",
        taskId="task-test-123",
        pageEpoch=1,
        sanitizedGoal="Enter my email and continue",
        pageMetadata=PageMetadata(
            origin="https://portal.example.com",
            sanitizedTitle="Applicant Portal",
            viewport=Viewport(width=1280.0, height=800.0),
        ),
        safeElements=[
            SafeElement(
                id="e1",
                role="textbox",
                safeLabel="Billing Email",
                inputType="email",
                isEnabled=True,
                bbox=BoundingBox(x=100.0, y=150.0, width=200.0, height=40.0),
            ),
            SafeElement(
                id="e2",
                role="button",
                safeLabel="Submit Application",
                inputType="submit",
                isEnabled=True,
                bbox=BoundingBox(x=100.0, y=220.0, width=150.0, height=40.0),
            ),
        ],
        availableTokens=[
            TokenCapability(
                tokenId="tok_1",
                tokenSymbol="[EMAIL_1]",
                privacyClass="PII_EMAIL",
                descriptionRole="Primary user email",
            )
        ],
    )
