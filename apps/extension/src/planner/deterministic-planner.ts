/**
 * Deterministic Mock Planner (Zone 5 - Local/Offline Reasoning Harness)
 *
 * OWNS: Deterministic, heuristic-based action proposal generation for offline demos and regression tests.
 * TRUST BOUNDARY: Returns untrusted ActionProposal data requiring local validation before execution.
 * MUST NOT: Bypass local validation or execute browser actions directly.
 */

import {
  type ActionProposal,
  type SafeContext,
  createActionId,
} from '@n-eye/protocol';
import type { Planner, PlannerOptions, PlannerProposalResult } from './types.js';

export class DeterministicPlanner implements Planner {
  private stepCount = 0;

  public async proposeAction(
    context: SafeContext,
    options?: PlannerOptions
  ): Promise<PlannerProposalResult> {
    const startTime = performance.now();
    this.stepCount += 1;

    // Check cancellation signal before computing
    if (options?.signal?.aborted) {
      throw new DOMException('Planner request was aborted by user.', 'AbortError');
    }

    const requestId = options?.requestId || `req_mock_${Date.now()}_${this.stepCount}`;
    let proposal: ActionProposal;

    // 1. Scoped token insertion for email fields if goal requests email
    const emailToken = context.availableTokens.find(
      (t) => t.privacyClass === 'PII_EMAIL' || t.tokenSymbol.includes('EMAIL')
    );
    const emailElement = context.safeElements.find(
      (e) =>
        (e.inputType === 'email' || (e.role === 'textbox' && e.safeLabel.toLowerCase().includes('email'))) &&
        e.isEnabled
    );

    if (emailToken && emailElement && !context.priorOutcome) {
      proposal = {
        actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
        type: 'TYPE_TOKEN',
        targetId: emailElement.id,
        tokenId: emailToken.tokenId,
        tokenSymbol: emailToken.tokenSymbol,
        reasoning: `Goal requests user email. Target element ${emailElement.id} matches email input. Proposing scoped token insertion.`,
        expectedOutcome: `Target ${emailElement.id} will be populated with local token ${emailToken.tokenSymbol}.`,
        riskLevel: 'MEDIUM',
      };
    } else {
      // 2. Submit / Continue / Login button click
      const submitBtn = context.safeElements.find(
        (e) =>
          (e.role === 'button' || e.inputType === 'submit') &&
          (e.safeLabel.toLowerCase().includes('submit') ||
            e.safeLabel.toLowerCase().includes('continue') ||
            e.safeLabel.toLowerCase().includes('login') ||
            e.safeLabel.toLowerCase().includes('sign in')) &&
          e.isEnabled
      );

      if (submitBtn) {
        const isHighRisk =
          submitBtn.safeLabel.toLowerCase().includes('submit') ||
          submitBtn.safeLabel.toLowerCase().includes('login');
        proposal = {
          actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
          type: 'CLICK',
          targetId: submitBtn.id,
          reasoning: `Found action button "${submitBtn.safeLabel}". Proposing click to advance workflow.`,
          expectedOutcome: 'Form will be submitted and state will transition.',
          riskLevel: isHighRisk ? 'HIGH' : 'LOW',
        };
      } else {
        // 3. Fallback: Complete task
        proposal = {
          actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
          type: 'COMPLETE',
          reasoning: 'All available goal actions completed on current page state.',
          expectedOutcome: 'Task marked complete.',
          riskLevel: 'LOW',
        };
      }
    }

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

  public reset(): void {
    this.stepCount = 0;
  }
}
