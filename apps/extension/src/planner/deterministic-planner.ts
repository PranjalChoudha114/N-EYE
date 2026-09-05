/**
 * Deterministic Mock Planner (Zone 5 - Local/Offline Reasoning Harness)
 *
 * OWNS: Bounded-grammar action proposals for offline demos and regression tests.
 * TRUST BOUNDARY: Returns untrusted ActionProposal data requiring local validation.
 * MUST NOT: Map unknown goals to COMPLETE. That is a false-success path.
 * MUST NOT: Treat step count as task success.
 */

import {
  type ActionProposal,
  type SafeContext,
  createActionId,
} from '@n-eye/protocol';
import type { Planner, PlannerOptions, PlannerProposalResult } from './types.js';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { createTaskGoalState, type TaskGoalState } from '../intelligence/task-state.js';
import {
  EXPLORE_SCROLL_PX,
  explorationSignature,
  shouldExploreForMissingTarget,
  priorWasExplorationScroll,
} from '../intelligence/exploration-policy.js';
import { getNalisMemory } from '../intelligence/memory.js';
import {
  parseMockGoal,
  pickUniqueClickTarget,
  pickUniqueSearchSubmitTarget,
  pickUniqueTypeTextTarget,
} from './mock-grammar.js';

export class DeterministicPlanner implements Planner {
  private stepCount = 0;
  /** Set when a search-submit CLICK or PRESS_ENTER has already been proposed this task. */
  private searchSubmitProposed = false;
  private taskState: TaskGoalState | null = null;
  private exploreScrollsUsed = 0;
  private lastExploreSignature: string | null = null;
  private lastProposedType: string | null = null;

  private snapshot(): {
    stepCount: number;
    searchSubmitProposed: boolean;
    taskState: TaskGoalState | null;
    exploreScrollsUsed: number;
    lastExploreSignature: string | null;
    lastProposedType: string | null;
  } {
    return {
      stepCount: this.stepCount,
      searchSubmitProposed: this.searchSubmitProposed,
      taskState: this.taskState,
      exploreScrollsUsed: this.exploreScrollsUsed,
      lastExploreSignature: this.lastExploreSignature,
      lastProposedType: this.lastProposedType,
    };
  }

  private restore(s: ReturnType<DeterministicPlanner['snapshot']>): void {
    this.stepCount = s.stepCount;
    this.searchSubmitProposed = s.searchSubmitProposed;
    this.taskState = s.taskState;
    this.exploreScrollsUsed = s.exploreScrollsUsed;
    this.lastExploreSignature = s.lastExploreSignature;
    this.lastProposedType = s.lastProposedType;
  }

  public async proposeAction(
    context: SafeContext,
    options?: PlannerOptions
  ): Promise<PlannerProposalResult> {
    const startTime = performance.now();
    const dry = options?.dryRun === true;
    const prior = dry ? this.snapshot() : null;
    this.stepCount += 1;

    if (options?.signal?.aborted) {
      if (prior) this.restore(prior);
      throw new DOMException('Planner request was aborted by user.', 'AbortError');
    }

    const requestId = options?.requestId || `req_mock_${Date.now()}_${this.stepCount}`;
    const proposal = this.buildProposal(context);
    const duration = performance.now() - startTime;
    const serialized = JSON.stringify(context);
    if (prior) this.restore(prior);

    return {
      proposal,
      metadata: {
        requestId,
        provider: 'mock',
        model: 'deterministic-v1',
        planningLatencyMs: Number(duration.toFixed(2)),
        payloadSizeBytes: serialized.length,
        reasoningProvenance: 'DETERMINISTIC_LOCAL',
      },
    };
  }

  private buildProposal(context: SafeContext): ActionProposal {
    const goal = context.sanitizedGoal || '';
    const interpreted = interpretGoal(goal);
    if (!this.taskState || this.taskState.interpreted.rawGoal !== interpreted.rawGoal) {
      this.taskState = createTaskGoalState(interpreted);
    }
    const intent = parseMockGoal(goal);
    const id = (): ReturnType<typeof createActionId> => createActionId(`act_${Date.now()}_${this.stepCount}`);

    const pendingSearchSubmit =
      intent.kind === 'type_text' && intent.requiresSearchSubmit && !this.searchSubmitProposed;

    // TRUST: Never COMPLETE because the loop hit a step budget. Remaining subgoals still matter.
    if (this.stepCount >= 8) {
      return {
        actionId: id(),
        type: 'ASK_USER',
        reasoning: 'The supported step budget was reached without local proof of the user goal. This is not completion.',
        expectedOutcome: 'User confirms the page or restates the goal.',
        riskLevel: 'LOW',
      };
    }

    const priorScroll =
      this.lastProposedType === 'SCROLL' || priorWasExplorationScroll(context.priorOutcome?.summary);

    if (
      intent.kind === 'click_labeled' &&
      context.priorOutcome?.status === 'VERIFIED' &&
      !pendingSearchSubmit &&
      !priorScroll
    ) {
      this.lastProposedType = 'COMPLETE';
      return {
        actionId: id(),
        type: 'COMPLETE',
        reasoning: 'Mock believes the click/navigation goal is done. Local proof still required.',
        expectedOutcome: 'Local arbiter confirms success or asks the user.',
        riskLevel: 'LOW',
      };
    }

    if (intent.kind === 'type_text') {
      if (interpreted.forbidSubmit && (this.searchSubmitProposed || this.lastProposedType === 'PRESS_ENTER')) {
        this.lastProposedType = 'ASK_USER';
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning: 'The goal forbids submitting. N-Eye will not press Enter or click submit.',
          expectedOutcome: 'User submits locally if they choose.',
          riskLevel: 'LOW',
        };
      }
      if (context.priorOutcome?.status === 'VERIFIED' && !intent.requiresSearchSubmit) {
        if (
          interpreted.family === 'MULTI_STEP' &&
          interpreted.labelHints.length > 0 &&
          !interpreted.forbidSubmit
        ) {
          const prefs = getNalisMemory().preferenceLabels(interpreted, context.pageMetadata.origin);
          const tail = pickUniqueClickTarget(context.safeElements, interpreted.labelHints, {
            preferredLabels: prefs,
          });
          if (tail.ok) {
            this.lastProposedType = 'CLICK';
            return {
              actionId: id(),
              type: 'CLICK',
              targetId: tail.target.id,
              reasoning: 'Typed text is proven. Next subgoal is a unique labeled control. Completion is still local.',
              expectedOutcome: 'Named control is activated and can be verified locally.',
              riskLevel: tail.target.inputType === 'submit' ? 'HIGH' : 'LOW',
            };
          }
          const explored = this.maybeExplore(context, tail.reason);
          if (explored) return explored;
          this.lastProposedType = 'ASK_USER';
          return {
            actionId: id(),
            type: 'ASK_USER',
            reasoning:
              tail.reason === 'ambiguous'
                ? 'Typed text may be present, but multiple next-step controls match. N-Eye will not guess.'
                : 'Typed text may be present, but the next-step control is not uniquely grounded.',
            expectedOutcome: 'User indicates the next control.',
            riskLevel: 'LOW',
          };
        }
        return {
          actionId: id(),
          type: 'COMPLETE',
          reasoning: 'Mock believes the type goal needs no further action. Local proof still required.',
          expectedOutcome: 'Local arbiter confirms the live field or asks the user.',
          riskLevel: 'LOW',
        };
      }
      if (intent.requiresSearchSubmit && this.searchSubmitProposed) {
        if (context.priorOutcome?.status === 'VERIFIED') {
          if (interpreted.family === 'MULTI_STEP' && interpreted.tailEntity && interpreted.labelHints.length > 0) {
            const prefs = getNalisMemory().preferenceLabels(interpreted, context.pageMetadata.origin);
            const resourcePick = pickUniqueClickTarget(context.safeElements, interpreted.labelHints, {
              preferredLabels: prefs,
            });
            if (resourcePick.ok) {
              this.lastProposedType = 'CLICK';
              return {
                actionId: id(),
                type: 'CLICK',
                targetId: resourcePick.target.id,
                reasoning:
                  'Search outcome was locally proposed. Next subgoal is a unique resource activation. Completion is still local.',
                expectedOutcome: 'Named resource is activated and can be verified locally.',
                riskLevel: 'LOW',
              };
            }
            const explored = this.maybeExplore(context, resourcePick.reason);
            if (explored) return explored;
            this.lastProposedType = 'ASK_USER';
            return {
              actionId: id(),
              type: 'ASK_USER',
              reasoning:
                resourcePick.reason === 'ambiguous'
                  ? 'Search may have run, but multiple resources match the next subgoal. N-Eye will not guess.'
                  : 'Search may have run, but the requested resource is not uniquely grounded. This is not completion.',
              expectedOutcome: 'User indicates the resource or restates the goal.',
              riskLevel: 'LOW',
            };
          }
          return {
            actionId: id(),
            type: 'COMPLETE',
            reasoning: 'Mock proposed search submit. Local proof of search outcome is still required.',
            expectedOutcome: 'Local arbiter confirms search occurred or asks the user.',
            riskLevel: 'LOW',
          };
        }
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning:
            'A search control was activated, but N-Eye could not verify that search actually occurred. This is not completion.',
          expectedOutcome: 'User confirms search results or retries.',
          riskLevel: 'LOW',
        };
      }
      if (context.priorOutcome?.status === 'VERIFIED' && intent.requiresSearchSubmit) {
        const picked = pickUniqueSearchSubmitTarget(context.safeElements);
        if (picked.ok) {
          this.searchSubmitProposed = true;
          const searchBtn = picked.target;
          return {
            actionId: id(),
            type: 'CLICK',
            targetId: searchBtn.id,
            reasoning: 'Text is present. Proposing the unique search/submit control. Completion is still local.',
            expectedOutcome: 'Search is submitted and the resulting state can be verified locally.',
            riskLevel: searchBtn.inputType === 'submit' ? 'HIGH' : 'LOW',
          };
        }
        if (picked.reason === 'ambiguous') {
          return {
            actionId: id(),
            type: 'ASK_USER',
            reasoning:
              'Typed text may be present, but multiple search/submit controls match. N-Eye will not guess. This is not completion.',
            expectedOutcome: 'User completes search.',
            riskLevel: 'LOW',
          };
        }
        const field = pickUniqueTypeTextTarget(context.safeElements, intent.fieldHints);
        if (field.ok) {
          this.searchSubmitProposed = true;
          return {
            actionId: id(),
            type: 'PRESS_ENTER',
            targetId: field.target.id,
            reasoning:
              'No unique visible search/submit control. Proposing constrained Enter on the unique typed field (implicit form/search submit). Completion is still local.',
            expectedOutcome: 'Search is submitted and the resulting state can be verified locally.',
            riskLevel: 'HIGH',
          };
        }
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning:
            'Typed text may be present, but N-Eye found no unique search button or typed field for Enter. This is not completion.',
          expectedOutcome: 'User completes search.',
          riskLevel: 'LOW',
        };
      }
      const picked = pickUniqueTypeTextTarget(context.safeElements, intent.fieldHints);
      if (!picked.ok) {
        this.lastProposedType = 'ASK_USER';
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
      if (picked.target.inputType === 'password') {
        this.lastProposedType = 'ASK_USER';
        return {
          actionId: id(),
          type: 'ASK_USER',
          reasoning:
            'The unique match is a password field. N-Eye will not type a password from the goal. NEVER_SEND stays intact.',
          expectedOutcome: 'User types the password locally if they choose.',
          riskLevel: 'LOW',
        };
      }
      this.lastProposedType = 'TYPE_TEXT';
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
      if (context.priorOutcome?.status === 'VERIFIED') {
        if (interpreted.family === 'MULTI_STEP' && interpreted.labelHints.length > 0 && !interpreted.forbidSubmit) {
          const prefs = getNalisMemory().preferenceLabels(interpreted, context.pageMetadata.origin);
          const tail = pickUniqueClickTarget(context.safeElements, interpreted.labelHints, {
            preferredLabels: prefs,
          });
          if (tail.ok) {
            this.lastProposedType = 'CLICK';
            return {
              actionId: id(),
              type: 'CLICK',
              targetId: tail.target.id,
              reasoning: 'Select is proven. Next subgoal is a unique labeled control. Completion is still local.',
              expectedOutcome: 'Named control is activated and can be verified locally.',
              riskLevel: tail.target.inputType === 'submit' ? 'HIGH' : 'LOW',
            };
          }
          const explored = this.maybeExplore(context, tail.reason);
          if (explored) return explored;
          this.lastProposedType = 'ASK_USER';
          return {
            actionId: id(),
            type: 'ASK_USER',
            reasoning:
              tail.reason === 'ambiguous'
                ? 'The option may be selected, but multiple next-step controls match. N-Eye will not guess.'
                : 'The option may be selected, but the next-step control is not uniquely grounded.',
            expectedOutcome: 'User indicates the next control.',
            riskLevel: 'LOW',
          };
        }
        this.lastProposedType = 'COMPLETE';
        return {
          actionId: id(),
          type: 'COMPLETE',
          reasoning: 'Mock believes the select goal needs no further action. Local proof still required.',
          expectedOutcome: 'Local arbiter confirms the live control or asks the user.',
          riskLevel: 'LOW',
        };
      }
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
      this.lastProposedType = 'SCROLL';
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
    const prefs = getNalisMemory().preferenceLabels(interpreted, context.pageMetadata.origin);
    const clickPick = pickUniqueClickTarget(context.safeElements, labelHints, { preferredLabels: prefs });
    if (
      clickPick.ok &&
      (intent.kind === 'click_labeled' || /submit|continue|login|sign in/i.test(goal))
    ) {
      const clickBtn = clickPick.target;
      const isHighRisk =
        clickBtn.safeLabel.toLowerCase().includes('submit') ||
        clickBtn.safeLabel.toLowerCase().includes('login') ||
        clickBtn.inputType === 'submit';
      this.lastProposedType = 'CLICK';
      return {
        actionId: id(),
        type: 'CLICK',
        targetId: clickBtn.id,
        reasoning: clickBtn.regionHeading
          ? `Found unique action control in region "${clickBtn.regionHeading}" (label "${clickBtn.safeLabel}").`
          : `Found unique action button "${clickBtn.safeLabel}".`,
        expectedOutcome: 'Control is activated.',
        riskLevel: isHighRisk ? 'HIGH' : 'LOW',
      };
    }
    if (!clickPick.ok && intent.kind === 'click_labeled') {
      const explored = this.maybeExplore(context, clickPick.reason);
      if (explored) return explored;
      this.lastProposedType = 'ASK_USER';
      return {
        actionId: id(),
        type: 'ASK_USER',
        reasoning:
          clickPick.reason === 'ambiguous'
            ? 'Multiple matching click targets. N-Eye will not guess which control to activate.'
            : 'No unique supported control matched this request.',
        expectedOutcome: 'User indicates the target or clicks locally.',
        riskLevel: 'LOW',
      };
    }

    this.lastProposedType = 'ASK_USER';
    return {
      actionId: id(),
      type: 'ASK_USER',
      reasoning:
        'This goal is outside the Mock planner grammar, or no unique supported control matched. N-Eye will not invent success.',
      expectedOutcome: 'User provides the next instruction or acts locally.',
      riskLevel: 'LOW',
    };
  }

  private maybeExplore(
    context: SafeContext,
    reason: 'none' | 'ambiguous'
  ): ActionProposal | null {
    const nextSignature = explorationSignature(context.safeElements);
    const verdict = shouldExploreForMissingTarget({
      groundingReason: reason,
      exploreScrollsUsed: this.exploreScrollsUsed,
      lastSignature: this.lastExploreSignature,
      nextSignature,
      priorSummary: context.priorOutcome?.summary,
    });
    if (!verdict.explore) return null;
    // TRUST: Pixel evidence already in SafeContext is not recovered by scrolling the viewport.
    if ((context.visualHints?.length ?? 0) > 0 && reason === 'none') {
      return null;
    }
    this.exploreScrollsUsed += 1;
    this.lastExploreSignature = nextSignature;
    this.lastProposedType = 'SCROLL';
    return {
      actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
      type: 'SCROLL',
      scrollDelta: { x: 0, y: EXPLORE_SCROLL_PX },
      reasoning: `${verdict.reason} Scrolling is exploration, not completion.`,
      expectedOutcome: 'Newly visible task-relevant controls can be observed.',
      riskLevel: 'LOW',
    };
  }

  public reset(): void {
    this.stepCount = 0;
    this.searchSubmitProposed = false;
    this.taskState = null;
    this.exploreScrollsUsed = 0;
    this.lastExploreSignature = null;
    this.lastProposedType = null;
  }
}
