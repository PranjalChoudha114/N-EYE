"""Deterministic server-side mock provider adapter for offline tests and demos.

Mirrors the extension Mock grammar: unknown goals ASK_USER, never COMPLETE.
Planner COMPLETE, when emitted after a verified type-only step, is still untrusted advice.
"""

import re
import time
from typing import Optional, Tuple
from .base import BaseProviderAdapter
from ..schemas.safe_context import SafeContext, SafeElement
from ..schemas.action_proposal import ActionProposal

_STOP = {
    "the", "a", "an", "in", "into", "on", "to", "for", "box", "field", "input", "bar", "area", "please",
}


def _hints(phrase: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", phrase.lower()) if len(t) >= 2 and t not in _STOP]


def _parse_goal(goal: str) -> Optional[dict]:
    g = (goal or "").strip()
    if not g:
        return None
    search = re.match(r'^(?:please\s+)?search\s+for\s+["\']?(.+?)["\']?\s*$', g, re.I)
    if search:
        return {"kind": "type_text", "text": search.group(1).strip(), "hints": ["search"], "search": True}
    type_in = re.match(
        r'^(?:please\s+)?(?:type|enter)\s+["\']?(.+?)["\']?\s+(?:in(?:to)?|on)\s+(?:the\s+)?(.+?)\s*$',
        g,
        re.I,
    )
    if type_in:
        return {"kind": "type_text", "text": type_in.group(1).strip(), "hints": _hints(type_in.group(2)), "search": False}
    fill = re.match(r'^(?:please\s+)?fill\s+(?:the\s+)?(.+?)\s+with\s+["\']?(.+?)["\']?\s*$', g, re.I)
    if fill:
        return {"kind": "type_text", "text": fill.group(2).strip(), "hints": _hints(fill.group(1)), "search": False}
    return None


def _typeable(el: SafeElement) -> bool:
    t = el.inputType or ""
    role = (el.role or "").lower()
    if t in {"password", "file", "submit", "button", "checkbox", "radio", "select"}:
        return False
    if t in {"text", "search", "textarea", "email", "tel", "number"}:
        return True
    if role in {"textbox", "searchbox"}:
        return True
    if role == "combobox" and t in {"text", "search", ""}:
        return True
    return False


def _score(el: SafeElement, hints: list[str]) -> int:
    if not _typeable(el) or not el.isEnabled:
        return -1
    hay = f"{el.safeLabel} {el.role} {el.inputType}".lower()
    score = 0
    role = (el.role or "").lower()
    if el.inputType == "search" or role == "searchbox":
        score += 2
    for hint in hints:
        if hint in hay:
            score += 3
    if "search" in hints and ("search" in hay or el.inputType == "search" or role == "searchbox"):
        score += 4
    return score


def _pick_unique(elements: list[SafeElement], hints: list[str]) -> Optional[SafeElement]:
    capable = [e for e in elements if _typeable(e) and e.isEnabled]
    if not capable:
        return None
    scored = [(e, _score(e, hints)) for e in capable]
    positive = [p for p in scored if p[1] > 0]
    pool = positive or scored
    max_s = max(p[1] for p in pool)
    winners = [p[0] for p in pool if p[1] == max_s]
    if len(winners) != 1:
        return None
    return winners[0]


class MockProviderAdapter(BaseProviderAdapter):
    """Deterministic offline planner adapter for CI, local tests, and fallbacks."""

    def __init__(self, model_name: str = "mock-deterministic-v1"):
        self._model_name = model_name

    def get_provider_name(self) -> str:
        return "mock"

    def get_model_name(self) -> str:
        return self._model_name

    async def propose(
        self, context: SafeContext, request_id: str
    ) -> Tuple[ActionProposal, Optional[int], Optional[int]]:
        action_suffix = f"act_{int(time.time() * 1000)}"
        goal = context.sanitizedGoal or ""
        intent = _parse_goal(goal)
        prior_ok = bool(context.priorOutcome and context.priorOutcome.status == "VERIFIED")

        if intent and intent["kind"] == "type_text" and prior_ok and not intent["search"]:
            return (
                ActionProposal(
                    actionId=f"{action_suffix}_done",
                    type="COMPLETE",
                    reasoning="Mock believes the type goal needs no further action. Local proof still required.",
                    expectedOutcome="Local arbiter confirms the live field or asks the user.",
                    riskLevel="LOW",
                ),
                80,
                25,
            )

        if intent and intent["kind"] == "type_text":
            if prior_ok and intent["search"]:
                search_btn = next(
                    (
                        e
                        for e in context.safeElements
                        if e.isEnabled
                        and (e.role == "button" or e.inputType == "submit")
                        and re.search(r"search|go|find|submit", e.safeLabel, re.I)
                    ),
                    None,
                )
                if search_btn:
                    return (
                        ActionProposal(
                            actionId=f"{action_suffix}_search",
                            type="CLICK",
                            targetId=search_btn.id,
                            reasoning="Text may be present. Proposing search/submit. Completion is still local.",
                            expectedOutcome="Search is submitted.",
                            riskLevel="HIGH" if search_btn.inputType == "submit" else "LOW",
                        ),
                        110,
                        35,
                    )
                return (
                    ActionProposal(
                        actionId=f"{action_suffix}_ask",
                        type="ASK_USER",
                        reasoning="Typed text may be present, but no unique search button was found. This is not completion.",
                        expectedOutcome="User completes search.",
                        riskLevel="LOW",
                    ),
                    80,
                    25,
                )
            target = _pick_unique(list(context.safeElements), intent["hints"])
            if not target:
                return (
                    ActionProposal(
                        actionId=f"{action_suffix}_ask",
                        type="ASK_USER",
                        reasoning="No unique supported text field matched this type goal. N-Eye will not invent success.",
                        expectedOutcome="User indicates the target or types locally.",
                        riskLevel="LOW",
                    ),
                    80,
                    25,
                )
            return (
                ActionProposal(
                    actionId=f"{action_suffix}_type",
                    type="TYPE_TEXT",
                    targetId=target.id,
                    textValue=intent["text"],
                    reasoning="Bounded Mock grammar: type requested text into the unique matching field.",
                    expectedOutcome="Live field holds the requested text.",
                    riskLevel="LOW",
                ),
                100,
                40,
            )

        email_token = next(
            (t for t in context.availableTokens if t.privacyClass == "PII_EMAIL" or "EMAIL" in t.tokenSymbol),
            None,
        )
        email_element = next(
            (
                e
                for e in context.safeElements
                if (e.inputType == "email" or (e.role == "textbox" and "email" in e.safeLabel.lower())) and e.isEnabled
            ),
            None,
        )

        if email_token and email_element and not context.priorOutcome and re.search(r"email|login|sign", goal, re.I):
            proposal = ActionProposal(
                actionId=f"{action_suffix}_1",
                type="TYPE_TOKEN",
                targetId=email_element.id,
                tokenId=email_token.tokenId,
                tokenSymbol=email_token.tokenSymbol,
                reasoning=f"Goal requests user email. Target element {email_element.id} matches email input.",
                expectedOutcome=f"Target {email_element.id} will be populated with local token {email_token.tokenSymbol}.",
                riskLevel="MEDIUM",
            )
            return proposal, 120, 45

        submit_btn = next(
            (
                e
                for e in context.safeElements
                if (e.role == "button" or e.inputType == "submit")
                and any(keyword in e.safeLabel.lower() for keyword in ["submit", "continue", "login", "sign in"])
                and e.isEnabled
            ),
            None,
        )

        if submit_btn and re.search(r"submit|continue|login|sign in", goal, re.I):
            is_high_risk = any(kw in submit_btn.safeLabel.lower() for kw in ["submit", "login", "pay", "delete"])
            proposal = ActionProposal(
                actionId=f"{action_suffix}_2",
                type="CLICK",
                targetId=submit_btn.id,
                reasoning=f"Found interactive button '{submit_btn.safeLabel}'.",
                expectedOutcome="Control is activated.",
                riskLevel="HIGH" if is_high_risk else "LOW",
            )
            return proposal, 110, 35

        proposal = ActionProposal(
            actionId=f"{action_suffix}_ask",
            type="ASK_USER",
            reasoning="This goal is outside the Mock planner grammar, or no unique supported control matched. N-Eye will not invent success.",
            expectedOutcome="User provides the next instruction or acts locally.",
            riskLevel="LOW",
        )
        return proposal, 80, 25
