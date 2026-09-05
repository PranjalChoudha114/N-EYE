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
    "my", "me", "this",
}


def _hints(phrase: str) -> list[str]:
    """Keep hyphenated names (N-EYE) as one unit. Splitting on '-' left only 'eye'."""
    text = re.sub(r"[\u2010-\u2015\u2212]", "-", (phrase or "").lower())
    out: list[str] = []
    seen: set[str] = set()

    def add(token: str) -> None:
        if token and token not in seen:
            seen.add(token)
            out.append(token)

    hyphenated = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)+", text)
    hyphen_parts = set()
    for unit in hyphenated:
        add(unit)
        add(unit.replace("-", ""))
        hyphen_parts.update(part for part in unit.split("-") if len(part) >= 2)
    for token in re.split(r"[^a-z0-9]+", text):
        if len(token) >= 2 and token not in _STOP and token not in hyphen_parts:
            add(token)
    return out


def _parse_goal(goal: str) -> Optional[dict]:
    g = (goal or "").strip()
    if not g:
        return None
    find_open = re.match(
        r'^(?:please\s+)?(?:find|locate)\s+["\']?(.+?)["\']?\s+and\s+(?:open|click|go\s+to)(?:\s+it)?\s*$',
        g,
        re.I,
    )
    if find_open:
        return {"kind": "click_labeled", "hints": _hints(find_open.group(1))}
    open_res = re.match(
        r'^(?:please\s+)?(?:open|go\s+to|navigate\s+to|visit)\s+(?:the\s+)?(?:my\s+)?["\']?(.+?)["\']?\s*$',
        g,
        re.I,
    )
    if open_res:
        return {"kind": "click_labeled", "hints": _hints(open_res.group(1))}
    search = re.match(
        r'^(?:please\s+)?search(?:\s+(?!for\b)(.+?))?\s+for\s+["\']?(.+?)["\']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$',
        g,
        re.I,
    )
    if search:
        query = search.group(2).strip()
        hints = ["search"] + _hints(search.group(1) or "") + _hints(search.group(3) or "")
        return {"kind": "type_text", "text": query, "hints": hints, "search": True}
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
    click = re.match(r'^(?:please\s+)?click\s+(?:the\s+)?(.+?)\s*$', g, re.I)
    if click:
        return {"kind": "click_labeled", "hints": _hints(click.group(1))}
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


def _click_capable(el: SafeElement) -> bool:
    if not el.isEnabled:
        return False
    role = (el.role or "").lower()
    t = el.inputType or ""
    if role in {"button", "link", "a", "tab", "menuitem", "summary"}:
        return True
    if t in {"submit", "button"}:
        return True
    if role in {"canvas", "img", "image"} and (el.safeLabel or "").strip():
        return True
    return False


def _hint_score(hay: str, hints: list[str]) -> int:
    compact = re.sub(r"[-_\s]", "", hay)
    score = 0
    for hint in hints:
        if not hint:
            continue
        if hint in hay:
            score += 3
            continue
        collapsed = hint.replace("-", "")
        if len(collapsed) >= 3 and collapsed in compact:
            score += 3
    return score


def _effective_click_hints(hints: list[str]) -> list[str]:
    chrome = {"button", "link", "icon", "control", "tab", "menu"}
    strong = [h for h in hints if len(h) >= 3 and h not in chrome]
    if strong:
        return strong
    residual = [h for h in hints if h not in chrome]
    return residual or hints


def _pick_click(elements: list[SafeElement], hints: list[str]) -> tuple[Optional[SafeElement], str]:
    capable = [e for e in elements if _click_capable(e)]
    click_hints = _effective_click_hints(hints)
    own: list[tuple[SafeElement, int]] = []
    for e in capable:
        hay = f"{e.safeLabel}".lower()
        score = _hint_score(hay, click_hints)
        if score > 0:
            own.append((e, score))
    if own:
        max_s = max(p[1] for p in own)
        winners = [p[0] for p in own if p[1] == max_s]
        if len(winners) != 1:
            return None, "ambiguous"
        return winners[0], "own"
    region: list[tuple[SafeElement, int]] = []
    for e in capable:
        heading = (e.regionHeading or "").lower()
        if not heading:
            continue
        score = _hint_score(heading, click_hints)
        if score > 0:
            region.append((e, score))
    if not region:
        return None, "none"
    max_s = max(p[1] for p in region)
    winners = [p[0] for p in region if p[1] == max_s]
    if len(winners) != 1:
        return None, "ambiguous"
    return winners[0], "region"


def _prior_was_scroll(context: SafeContext) -> bool:
    if not context.priorOutcome or not context.priorOutcome.summary:
        return False
    return "scroll" in context.priorOutcome.summary.lower()


def _near_unique_search(el: SafeElement, elements: list[SafeElement]) -> bool:
    fields = [
        e
        for e in elements
        if e.isEnabled and (e.inputType == "search" or (e.role or "").lower() == "searchbox")
    ]
    if len(fields) != 1:
        return False
    search = fields[0]
    dy = abs((el.bbox.y + el.bbox.height / 2) - (search.bbox.y + search.bbox.height / 2))
    close_y = dy <= max(search.bbox.height, el.bbox.height) + 16
    close_x = abs(el.bbox.x - (search.bbox.x + search.bbox.width)) < 96
    return close_y and close_x


def _score_search_submit(el: SafeElement, elements: list[SafeElement]) -> int:
    if not el.isEnabled:
        return -1
    role = (el.role or "").lower()
    if role in {"canvas", "img", "image"}:
        return -1
    t = el.inputType or ""
    is_control = role == "button" or t in {"submit", "button"} or role == "link" or el.formSubmitting is True
    if not is_control:
        return -1
    trimmed = (el.safeLabel or "").strip()
    score = 0
    if t == "submit" or el.formSubmitting is True:
        score += 5
    if role == "button" or t in {"submit", "button"}:
        score += 2
    if _near_unique_search(el, elements) and role != "link" and not trimmed:
        score += 4
    if not trimmed:
        if not (el.formSubmitting is True or t == "submit" or _near_unique_search(el, elements)):
            return -1
        return max(score, 1) if score > 0 else -1
    if re.match(r"^search$", trimmed, re.I):
        score += 6
    elif re.search(r"\bsearch\b", trimmed, re.I):
        score += 4
    if re.search(r"\bsubmit\b", trimmed, re.I):
        score += 4
    if re.search(r"\bfind\b", trimmed, re.I) and not re.search(r"\bsearch\b", trimmed, re.I):
        score += 2
    if re.match(r"^go$", trimmed, re.I):
        score += 3
    return score


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
                scored = [(e, _score_search_submit(e, list(context.safeElements))) for e in context.safeElements]
                positive = [p for p in scored if p[1] > 0]
                candidates = []
                if positive:
                    max_s = max(p[1] for p in positive)
                    candidates = [p[0] for p in positive if p[1] == max_s]
                if len(candidates) > 1:
                    return (
                        ActionProposal(
                            actionId=f"{action_suffix}_ask",
                            type="ASK_USER",
                            reasoning="Typed text may be present, but multiple search/submit controls match. N-Eye will not guess. This is not completion.",
                            expectedOutcome="User completes search.",
                            riskLevel="LOW",
                        ),
                        80,
                        25,
                    )
                if len(candidates) == 1:
                    search_btn = candidates[0]
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
                field = _pick_unique(list(context.safeElements), intent["hints"])
                if field:
                    return (
                        ActionProposal(
                            actionId=f"{action_suffix}_enter",
                            type="PRESS_ENTER",
                            targetId=field.id,
                            reasoning="No unique visible search/submit control. Proposing constrained Enter on the unique typed field.",
                            expectedOutcome="Search is submitted.",
                            riskLevel="HIGH",
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

        if intent and intent["kind"] == "click_labeled" and prior_ok and not _prior_was_scroll(context):
            return (
                ActionProposal(
                    actionId=f"{action_suffix}_done",
                    type="COMPLETE",
                    reasoning="Mock believes the click goal is done. Local proof still required.",
                    expectedOutcome="Local arbiter confirms success or asks the user.",
                    riskLevel="LOW",
                ),
                80,
                25,
            )

        if intent and intent["kind"] == "click_labeled":
            hints = intent["hints"]
            click_el, reason = _pick_click(list(context.safeElements), hints)
            if click_el:
                return (
                    ActionProposal(
                        actionId=f"{action_suffix}_click",
                        type="CLICK",
                        targetId=click_el.id,
                        reasoning=f"Found unique action control '{click_el.safeLabel}'.",
                        expectedOutcome="Control is activated.",
                        riskLevel="HIGH" if (click_el.inputType == "submit" or "submit" in click_el.safeLabel.lower()) else "LOW",
                    ),
                    110,
                    35,
                )
            if reason == "none" and not prior_ok:
                return (
                    ActionProposal(
                        actionId=f"{action_suffix}_explore",
                        type="SCROLL",
                        scrollDelta={"x": 0, "y": 480},
                        reasoning="No unique supported control in the current observation. Bounded scroll is exploration, not completion.",
                        expectedOutcome="Newly visible task-relevant controls can be observed.",
                        riskLevel="LOW",
                    ),
                    80,
                    25,
                )
            return (
                ActionProposal(
                    actionId=f"{action_suffix}_ask",
                    type="ASK_USER",
                    reasoning="No unique supported control matched this request. N-Eye will not invent success.",
                    expectedOutcome="User indicates the target or clicks locally.",
                    riskLevel="LOW",
                ),
                80,
                25,
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
