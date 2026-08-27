"""Tests for SafeContext and ActionProposal Pydantic schema validation."""

import pytest
from pydantic import ValidationError
from src.schemas.safe_context import SafeContext
from src.schemas.action_proposal import ActionProposal


def test_valid_safe_context(sample_safe_context: SafeContext):
    """Ensure valid SafeContext deserializes cleanly."""
    data = sample_safe_context.model_dump()
    reconstructed = SafeContext.model_validate(data)
    assert reconstructed.protocolVersion == "1.0.0"
    assert reconstructed.taskId == "task-test-123"
    assert len(reconstructed.safeElements) == 2


def test_reject_raw_scene_properties(sample_safe_context: SafeContext):
    """Ensure SafeContext rejects any attempt to pass raw DOM scenes or local properties."""
    data = sample_safe_context.model_dump()
    data["_isLocalOnly"] = True

    with pytest.raises(ValidationError) as exc:
        SafeContext.model_validate(data)
    assert "RawScene leakage detected" in str(exc.value)


def test_reject_privacy_findings_leakage(sample_safe_context: SafeContext):
    """Ensure SafeContext rejects unredacted privacy findings dictionary."""
    data = sample_safe_context.model_dump()
    data["privacyFindings"] = [{"findingId": "f1", "rawText": "secret"}]

    with pytest.raises(ValidationError) as exc:
        SafeContext.model_validate(data)
    assert "RawScene leakage detected" in str(exc.value)


def test_reject_invalid_protocol_version(sample_safe_context: SafeContext):
    """Ensure unsupported protocol version is strictly rejected."""
    data = sample_safe_context.model_dump()
    data["protocolVersion"] = "2.0.0"

    with pytest.raises(ValidationError):
        SafeContext.model_validate(data)


def test_valid_action_proposal():
    """Ensure valid ActionProposal conforms to schema."""
    proposal = ActionProposal(
        actionId="act_123",
        type="TYPE_TOKEN",
        targetId="e1",
        tokenId="tok_1",
        tokenSymbol="[EMAIL_1]",
        reasoning="Inserting email token into email textbox",
        expectedOutcome="Element populated with scoped token",
        riskLevel="MEDIUM",
    )
    assert proposal.type == "TYPE_TOKEN"
    assert proposal.riskLevel == "MEDIUM"


def test_reject_invalid_action_type():
    """Ensure unknown or arbitrary action type is rejected."""
    with pytest.raises(ValidationError):
        ActionProposal.model_validate({
            "actionId": "act_123",
            "type": "EXECUTE_JAVASCRIPT",  # Strictly forbidden
            "reasoning": "Malicious payload",
            "expectedOutcome": "PWN",
            "riskLevel": "LOW",
        })
