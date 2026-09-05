"""Parse untrusted provider JSON into an ActionProposal.

OWNS: Extracting a schema-shaped proposal from model text without granting extra fields authority.
TRUST: Extra keys that claim confirmation, selectors, or scripts fail closed.
WHAT MAY CROSS: Known ActionProposal fields after JSON parse.
WHAT MUST NEVER CROSS: Unknown authority-claim keys, RawScene, or raw secrets.
"""

from __future__ import annotations

import json
import re
from typing import Any, Mapping

from ..schemas.action_proposal import ActionProposal
from .base import ProviderSchemaError

ALLOWED_KEYS = {
    "actionId",
    "type",
    "targetId",
    "tokenId",
    "tokenSymbol",
    "textValue",
    "scrollDelta",
    "reasoning",
    "expectedOutcome",
    "riskLevel",
}

AUTHORITY_CLAIM_KEYS = {
    "confirmed",
    "userConfirmed",
    "confirmation",
    "approved",
    "verified",
    "verification",
    "policyOverride",
    "override",
    "privacyOverride",
    "riskOverride",
    "trusted",
    "selector",
    "cssSelector",
    "xpath",
    "javascript",
    "script",
    "eval",
    "code",
    "command",
    "url",
    "href",
    "epoch",
    "pageEpoch",
    "frameId",
    "origin",
    "systemPrompt",
    "hotkey",
    "keyName",
    "keys",
    "keyboard",
}

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json_object(raw_text: str) -> dict[str, Any]:
    text = _FENCE.sub("", (raw_text or "").strip()).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ProviderSchemaError("Provider output was not valid JSON.") from exc
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError as inner:
            raise ProviderSchemaError("Provider output was not valid JSON.") from inner
    if not isinstance(parsed, dict):
        raise ProviderSchemaError("Provider JSON was not an object.")
    return parsed


def coerce_action_proposal(raw: Mapping[str, Any]) -> ActionProposal:
    extra = set(raw.keys()) - ALLOWED_KEYS
    claimed = extra & AUTHORITY_CLAIM_KEYS
    if claimed:
        raise ProviderSchemaError("Provider proposal claimed local authority fields.")
    cleaned = {key: value for key, value in raw.items() if key in ALLOWED_KEYS}
    try:
        return ActionProposal.model_validate(cleaned)
    except Exception as exc:
        raise ProviderSchemaError("Failed to parse provider output into ActionProposal.") from exc


def first_text_part(parts: list[Any] | None) -> str:
    texts: list[str] = []
    for part in parts or []:
        if isinstance(part, dict) and isinstance(part.get("text"), str) and part["text"].strip():
            texts.append(part["text"].strip())
    if not texts:
        raise ProviderSchemaError("Gemini returned candidate without valid text content.")
    for text in texts:
        if text.startswith("{") or text.startswith("```"):
            return text
    return texts[-1]
