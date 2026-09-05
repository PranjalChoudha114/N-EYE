"""Provider JSON → ActionProposal coercion."""

import pytest
from src.adapters.base import ProviderSchemaError
from src.adapters.proposal_parse import coerce_action_proposal, extract_json_object, first_text_part


def test_extracts_json_from_markdown_fence():
    raw = """```json
{"actionId":"a1","type":"ASK_USER","reasoning":"need help","expectedOutcome":"ask","riskLevel":"LOW"}
```"""
    proposal = coerce_action_proposal(extract_json_object(raw))
    assert proposal.type == "ASK_USER"
    assert proposal.actionId == "a1"


def test_strips_harmless_extra_keys_but_rejects_authority_claims():
    base = {
        "actionId": "a1",
        "type": "CLICK",
        "targetId": "e1",
        "reasoning": "unique",
        "expectedOutcome": "clicked",
        "riskLevel": "LOW",
        "confidence": 0.9,
    }
    proposal = coerce_action_proposal(base)
    assert proposal.type == "CLICK"
    with pytest.raises(ProviderSchemaError):
        coerce_action_proposal({**base, "selector": "#evil"})
    with pytest.raises(ProviderSchemaError):
        coerce_action_proposal({**base, "hotkey": "Enter"})


def test_first_text_part_skips_thought_parts():
    parts = [{"thought": True}, {"text": '{"actionId":"a1"}'}]
    assert first_text_part(parts).startswith("{")
    with pytest.raises(ProviderSchemaError):
        first_text_part([{"inlineData": {"mimeType": "image/png"}}])
