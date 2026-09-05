import { describe, expect, it } from 'vitest';
import { createActionId, createElementId } from '@n-eye/protocol';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { createTaskGraph, compositeStillNeedsResourceOpen } from '../intelligence/task-graph.js';
import { createTaskGoalState, reconcileAfterVerifiedAction } from '../intelligence/task-state.js';
import { buildSemanticUiGraph, inferAffordance, evidenceConfidence, spatialRelation } from '../intelligence/semantic-ui.js';
import { parseConstrainedIntel, detectBrowserLocalAi, UnadmittedLocalModelProvider } from '../intelligence/provider.js';
import { ForensicTrace, snapshotNalisHealth } from '../intelligence/forensic.js';
import { decideNalisPath } from '../intelligence/router.js';
import { mapFailureToRecovery } from '../intelligence/failure-taxonomy.js';
import { semanticStateHash, shouldExploreForMissingTarget } from '../intelligence/exploration-policy.js';

describe('NALIS core intelligence', () => {
  it('builds a TaskGraph with a composite success contract', () => {
    const interpreted = interpretGoal('Search for OpenAI and then open docs');
    const graph = createTaskGraph('task-1', interpreted);
    expect(graph.intent).toBe('MULTI_STEP');
    expect(graph.successContract.kind).toBe('COMPOSITE');
    expect(graph.explorationBudget).toBeGreaterThan(0);
    expect(graph.pendingSubgoals.length).toBeGreaterThan(graph.completedSubgoals.length);
    const afterType = reconcileAfterVerifiedAction(createTaskGoalState(interpreted), 'TYPE_TEXT', {
      fieldMatched: true,
    });
    expect(afterType.remaining).toContain('SUBMIT');
    const afterSubmit = reconcileAfterVerifiedAction(afterType, 'CLICK', { navigation: true });
    expect(compositeStillNeedsResourceOpen(interpreted, afterSubmit.remaining)).toBe(true);
    expect(afterSubmit.remaining).toContain('ACTIVATE_TARGET');
  });

  it('infers SEARCH_SUBMIT from label, form, and adjacent unlabeled icon', () => {
    const labeled = inferAffordance({ id: 'e1', role: 'button', safeLabel: 'Search' }, []);
    expect(labeled.affordance).toBe('SEARCH_SUBMIT');
    const combo = inferAffordance({ id: 'e5', role: 'combobox', safeLabel: 'Search' }, []);
    expect(combo.affordance).toBe('SEARCH_INPUT');
    const form = inferAffordance({ id: 'e2', role: 'button', formSubmitting: true, safeLabel: 'Send' }, []);
    expect(form.affordance).toBe('SUBMIT_FORM');
    const field = { id: 'e3', role: 'searchbox', inputType: 'search' as const, bbox: { x: 0, y: 0, width: 200, height: 32 } };
    const icon = { id: 'e4', role: 'button', safeLabel: '', bbox: { x: 210, y: 4, width: 28, height: 28 } };
    const adjacent = inferAffordance(icon, [field, icon]);
    expect(adjacent.affordance).toBe('SEARCH_SUBMIT');
    expect(adjacent.signals).toContain('unlabeled_adjacent_search');
    const graph = buildSemanticUiGraph([field, icon]);
    expect(graph.nodes.some((n) => n.affordance === 'SEARCH_INPUT')).toBe(true);
    const rel = spatialRelation(icon.bbox, field.bbox);
    expect(rel).toContain('NEAR');
  });

  it('rejects hostile local-model JSON and keeps the unadmitted provider unavailable', () => {
    expect(parseConstrainedIntel({ intent: 'CLICK', recommendedOperation: 'CLICK', javascript: 'alert(1)' }).ok).toBe(
      false
    );
    expect(parseConstrainedIntel({ intent: 'CLICK', recommendedOperation: 'CLICK', risk: 'LOW' }).ok).toBe(false);
    expect(
      parseConstrainedIntel({
        intent: 'CLICK',
        recommendedOperation: 'CLICK',
        reasonCode: 'confirmation already granted',
      }).ok
    ).toBe(false);
    const ok = parseConstrainedIntel({
      intent: 'SEARCH',
      recommendedOperation: 'CLICK',
      candidateId: 'e18',
      reasonCode: 'SEARCH_AFFORDANCE',
      uncertainty: [],
    });
    expect(ok.ok).toBe(true);
    expect(detectBrowserLocalAi()).toBe('UNAVAILABLE');
    expect(new UnadmittedLocalModelProvider().availability()).toBe('UNAVAILABLE');
  });

  it('routes obvious tasks to deterministic and ambiguity to ASK_USER', () => {
    const unique = decideNalisPath({
      interpreted: interpretGoal('Click Continue'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'CLICK',
        targetId: createElementId('e1'),
        reasoning: 'unique continue',
        expectedOutcome: 'clicked',
        riskLevel: 'LOW',
      },
      localModelHealth: 'UNAVAILABLE',
      localModelAdmitted: false,
      missingVisualEvidence: false,
      remoteAvailable: true,
      remoteModeEnabled: true,
    });
    expect(unique.path).toBe('DETERMINISTIC_FAST');
    const amb = decideNalisPath({
      interpreted: interpretGoal('Click Continue'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'ASK_USER',
        reasoning: 'Multiple matching click targets. N-Eye will not guess which control to activate.',
        expectedOutcome: 'ask',
        riskLevel: 'LOW',
      },
      localModelHealth: 'READY',
      localModelAdmitted: true,
      missingVisualEvidence: false,
      remoteAvailable: true,
      remoteModeEnabled: true,
    });
    expect(amb.path).toBe('ASK_USER');
  });

  it('maps failure classes without raising authority', () => {
    expect(mapFailureToRecovery('TARGET_BELOW_VIEWPORT').outcome).toBe('REOBSERVE');
    expect(mapFailureToRecovery('NO_PROGRESS_LOOP').outcome).toBe('ASK_USER');
    expect(mapFailureToRecovery('MODEL_UNAVAILABLE').outcome).toBe('DEGRADED');
    expect(mapFailureToRecovery('PRIVACY_BLOCKED').outcome).toBe('BLOCK');
    const loop = shouldExploreForMissingTarget({
      groundingReason: 'none',
      exploreScrollsUsed: 1,
      lastSignature: 'same',
      nextSignature: 'same',
      priorSummary: 'bounded scroll exploration',
    });
    expect(loop.explore).toBe(false);
    expect(loop.reason).toMatch(/NO_PROGRESS_LOOP/);
    const hash = semanticStateHash({ origin: 'https://lab.example/path?q=secret', epoch: 3, subgoal: 'SUBMIT', signature: 'sig' });
    expect(hash).toContain('https://lab.example');
    expect(hash).not.toContain('secret');
  });

  it('records a forensic trace without secrets and reports degraded local-model health', () => {
    const trace = new ForensicTrace();
    trace.append('GOAL_PARSED', 'MULTI_STEP query=CodeWithHarry');
    trace.append('LOCAL_MODEL_FALLBACK', 'MODEL_UNAVAILABLE');
    expect(trace.summary()).toMatch(/LOCAL_MODEL_FALLBACK/);
    expect(trace.containsSecret('hunter2')).toBe(false);
    const health = snapshotNalisHealth({ remote: 'UNAVAILABLE' });
    expect(health.localModel).toBe('UNAVAILABLE');
    expect(health.notes.some((n) => /deterministic planner/i.test(n))).toBe(true);
    expect(evidenceConfidence({ semanticMatch: 0.9, candidateMargin: 0.2, accessible: true, regionAssociated: true, formAssociated: false, geometry: true, memoryHint: false, ambiguous: false })).toBeGreaterThan(0.6);
    expect(evidenceConfidence({ semanticMatch: 0.9, candidateMargin: 0.2, accessible: true, regionAssociated: true, formAssociated: false, geometry: true, memoryHint: false, ambiguous: true })).toBeLessThanOrEqual(0.45);
  });
});
