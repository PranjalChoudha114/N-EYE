"""Deterministic server-side mock provider adapter for offline tests and demos.

This adapter reproduces the deterministic reasoning rules of N-Eye, allowing
full end-to-end integration and security testing without requiring live API keys.
"""

import time
from typing import Optional, Tuple
from .base import BaseProviderAdapter
from ..schemas.safe_context import SafeContext
from ..schemas.action_proposal import ActionProposal


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
        """Propose a deterministic action based on available tokens and elements."""
        action_suffix = f"act_{int(time.time() * 1000)}"

        # Rule 1: Scoped token insertion if goal matches token capability
        email_token = next(
            (t for t in context.availableTokens if t.privacyClass == "PII_EMAIL" or "EMAIL" in t.tokenSymbol),
            None,
        )
        email_element = next(
            (
                e for e in context.safeElements
                if (e.inputType == "email" or (e.role == "textbox" and "email" in e.safeLabel.lower())) and e.isEnabled
            ),
            None,
        )

        if email_token and email_element and not context.priorOutcome:
            proposal = ActionProposal(
                actionId=f"{action_suffix}_1",
                type="TYPE_TOKEN",
                targetId=email_element.id,
                tokenId=email_token.tokenId,
                tokenSymbol=email_token.tokenSymbol,
                reasoning=f"Goal requests user email. Target element {email_element.id} matches email input. Proposing scoped token insertion.",
                expectedOutcome=f"Target {email_element.id} will be populated with local token {email_token.tokenSymbol}.",
                riskLevel="MEDIUM",
            )
            return proposal, 120, 45

        # Rule 2: Submit / Continue / Login button click
        submit_btn = next(
            (
                e for e in context.safeElements
                if (e.role == "button" or e.inputType == "submit")
                and any(keyword in e.safeLabel.lower() for keyword in ["submit", "continue", "login", "sign in"])
                and e.isEnabled
            ),
            None,
        )

        if submit_btn:
            is_high_risk = any(kw in submit_btn.safeLabel.lower() for kw in ["submit", "login", "pay", "delete"])
            proposal = ActionProposal(
                actionId=f"{action_suffix}_2",
                type="CLICK",
                targetId=submit_btn.id,
                reasoning=f"Found interactive button '{submit_btn.safeLabel}'. Proposing click to advance workflow.",
                expectedOutcome="Form will be submitted and state will transition.",
                riskLevel="HIGH" if is_high_risk else "LOW",
            )
            return proposal, 110, 35

        # Rule 3: Complete task
        proposal = ActionProposal(
            actionId=f"{action_suffix}_3",
            type="COMPLETE",
            reasoning="All available actions completed on current page state.",
            expectedOutcome="Task marked complete.",
            riskLevel="LOW",
        )
        return proposal, 80, 25
