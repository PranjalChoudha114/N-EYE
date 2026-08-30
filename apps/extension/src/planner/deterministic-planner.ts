/**
 * Deterministic Mock Planner (Zone 5 - Local/Offline Reasoning Harness)
 *
 * OWNS: Bounded-grammar action proposals for offline demos and regression tests.
 * TRUST BOUNDARY: Returns untrusted ActionProposal data requiring local validation.
 * MUST NOT: Map unknown goals to COMPLETE. That is a false-success path.
 */

import {
  type ActionProposal,
  type SafeContext,
  createActionId,
} from '@n-eye/protocol';
import type { Planner, PlannerOptions, PlannerProposalResult } from './types.js';
import { parseMockGoal, pickUniqueTypeTextTarget } from './mock-grammar.js';

export class DeterministicPlanner implements Planner {
  private stepCount = 0;

  public async proposeAction(
    context: SafeContext,
    options?: PlannerOptions
  ): Promise<PlannerProposalResult> {
    const startTime = performance.now();
    this.stepCount += 1;

    if (options?.signal?.aborted) {
      throw new DOMException('Planner request was aborted by user.', 'AbortError');
    }

    const requestId = options?.requestId || `req_mock_${Date.now()}_${this.stepCount}`;
    const proposal = this.buildProposal(context);
    const duration = performance.now() - startTime;
    const serialized = JSON.stringify(context);

    return {
      proposal,
      metadata: {
        requestId,
        provider: 'mock',
        model: 'deterministic-v1',
        planningLatencyMs: Number(duration.toFixed(2)),
        payloadSizeBytes: serialized.length,
      },
    };
  }

  private buildProposal(context: SafeContext): ActionProposal {
    const goal = context.sanitizedGoal || '';
    const intent = parseMockGoal(goal);
    const id = (): ReturnType<typeof createActionId> => createActionId(`act_${Date.now()}_${this.stepCount}`);

    if (context.priorOutcome?.status === 'VERIFIED' && this.stepCount >= 3) {
      return {
        actionId: id(),
        type: 'COMPLETE',
        reasoning: 'Mock believes the bounded sequence is done. Local proof still required.',
        expectedOutcome: 'Local arbiter confirms success or asks the user.',
        riskLevel: 'LOW',
      };
    }

    if (intent.kind === 'click_labeled' && context.priorOutcome?.status === 'VERIFIED') {
      return {
        actionId: id(),
        type: 'COMPLETE',
        reasoning: 'Mock believes the click goal is done. Local proof still required.',
        expectedOutcome: 'Local arbiter confirms success or asks the user.',
        riskLevel: 'LOW',
      };
    }

    if (intent.kind === 'type_text') {
      if (context.priorOutcome?.status === 'VERIFIED' && !intent.requiresSearchSubmit) {
        return {
          actionId: id(),
          type: 'COMPLETE',
          reasoning: 'Mock believes the type goal needs no further action. Local proof still required.',
          expectedOutcome: 'Local arbiter confirms the live field or asks the user.',
          riskLevel: 'LOW',
        };
      }
      if (context.priorOutcome?.status === 'VERIFIED' && intent.requiresSearchSubmit) {
        const searchBtn = context.safeElements.find(
          (e) =>
            e.isEnabled &&
            (e.role === 'button' || e.inputType === 'submit') &&
            /search|go|find|submit/i.test(e.safeLabel)
        );
        if (searchBtn) {
          return {
            actionId: id(),
            type: 'CLICK',
            targetId: searchBtn.id,
            reasoning: 'Text is present. Proposing a search/submit click. Completion is still local.',
            expectedOutcome: 'Search is submitted.',
            riskLevel: searchBtn.inputType === 'submit' ? 'HIGH' : 'LOW',
          };
        }
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning:
            'Typed text may be present, but N-Eye found no unique search button to click. This is not completion.',
          expectedOutcome: 'User completes search.',
          riskLevel: 'LOW',
        };
      }
      const picked = pickUniqueTypeTextTarget(context.safeElements, intent.fieldHints);
      if (!picked.ok) {
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning:
            picked.reason === 'ambiguous'
              ? 'Multiple matching text fields. N-Eye will not guess which one to type into.'
              : 'No supported text field matched this type goal.',
          expectedOutcome: 'User indicates the target or types locally.',
          riskLevel: 'LOW',
        };
      }
      return {
        actionId: id(),
        type: 'TYPE_TEXT',
        targetId: picked.target.id,
        textValue: intent.text,
        reasoning: `Bounded Mock grammar: type requested text into the unique matching field ${picked.target.id}.`,
        expectedOutcome: 'Live field holds the requested text.',
        riskLevel: 'LOW',
      };
    }

    if (intent.kind === 'select') {
      const natives = context.safeElements.filter((e) => e.isEnabled && e.inputType === 'select');
      if (natives.length !== 1 || !natives[0]) {
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning: 'SELECT needs a unique native select. Custom widgets are not guessed.',
          expectedOutcome: 'User selects the option.',
          riskLevel: 'LOW',
        };
      }
      return {
        actionId: id(),
        type: 'SELECT',
        targetId: natives[0].id,
        textValue: intent.option,
        reasoning: 'Bounded Mock grammar: native SELECT.',
        expectedOutcome: 'Option selected.',
        riskLevel: 'LOW',
      };
    }

    if (intent.kind === 'scroll') {
      const dy = intent.direction === 'up' ? -400 : intent.direction === 'down' ? 400 : 0;
      const dx = intent.direction === 'left' ? -400 : intent.direction === 'right' ? 400 : 0;
      return {
        actionId: id(),
        type: 'SCROLL',
        scrollDelta: { x: dx, y: dy },
        reasoning: 'Bounded Mock grammar: viewport scroll.',
        expectedOutcome: 'Scroll position changes or is at a boundary.',
        riskLevel: 'LOW',
      };
    }

    const emailToken = context.availableTokens.find(
      (t) => t.privacyClass === 'PII_EMAIL' || t.tokenSymbol.includes('EMAIL')
    );
    const emailElement = context.safeElements.find(
      (e) =>
        (e.inputType === 'email' || (e.role === 'textbox' && e.safeLabel.toLowerCase().includes('email'))) &&
        e.isEnabled
    );
    if (emailToken && emailElement && !context.priorOutcome && /email|login|sign/i.test(goal)) {
      return {
        actionId: id(),
        type: 'TYPE_TOKEN',
        targetId: emailElement.id,
        tokenId: emailToken.tokenId,
        tokenSymbol: emailToken.tokenSymbol,
        reasoning: `Goal requests user email. Target element ${emailElement.id} matches email input.`,
        expectedOutcome: `Target ${emailElement.id} will be populated with local token ${emailToken.tokenSymbol}.`,
        riskLevel: 'MEDIUM',
      };
    }

    const labelHints =
      intent.kind === 'click_labeled'
        ? intent.labelHints
        : ['submit', 'continue', 'login', 'sign'];
    const clickBtn = context.safeElements.find((e) => {
      if (!e.isEnabled) return false;
      if (!(e.role === 'button' || e.inputType === 'submit')) return false;
      const label = e.safeLabel.toLowerCase();
      return labelHints.some((h) => label.includes(h));
    });
    if (clickBtn && (intent.kind === 'click_labeled' || /submit|continue|login|sign in/i.test(goal))) {
      const isHighRisk =
        clickBtn.safeLabel.toLowerCase().includes('submit') ||
        clickBtn.safeLabel.toLowerCase().includes('login') ||
        clickBtn.inputType === 'submit';
      return {
        actionId: id(),
        type: 'CLICK',
        targetId: clickBtn.id,
        reasoning: `Found action button "${clickBtn.safeLabel}".`,
        expectedOutcome: 'Control is activated.',
        riskLevel: isHighRisk ? 'HIGH' : 'LOW',
      };
    }

    return {
      actionId: id(),
      type: 'ASK_USER',
      reasoning:
        'This goal is outside the Mock planner grammar, or no unique supported control matched. N-Eye will not invent success.',
      expectedOutcome: 'User provides the next instruction or acts locally.',
      riskLevel: 'LOW',
    };
  }

  public reset(): void {
    this.stepCount = 0;
  }
}
