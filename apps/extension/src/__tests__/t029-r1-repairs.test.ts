/**
 * T029-R1 regressions (Zone 3).
 * MUST NOT: scenario-08 ids, CONTINUE literals, Wikipedia/GitHub hostnames, or fixture coordinates in production.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createElementId, createPageEpoch, createTaskId, type SafeElement } from '@n-eye/protocol';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { applyFusionLabels, groundAndFuse } from '../perception/grounding.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { runPerception } from '../perception/orchestrator.js';
import { PixelBuffer } from '../perception/pixel-buffer.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { pickUniqueClickTarget, pickUniqueSearchSubmitTarget } from '../planner/mock-grammar.js';
import { detectElementPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { clickHitTest } from '../execution/hit-test.js';
import { arbitratePlannerComplete } from '../runtime/completion-arbiter.js';
import { EvidenceLedger } from '../runtime/evidence-ledger.js';
import { buildVerifiedTaskReport } from '../runtime/task-report.js';
import { createIdleState } from '../runtime/ui-snapshot.js';

function box(x = 0, y = 0): { x: number; y: number; width: number; height: number } {
  return { x, y, width: 120, height: 28 };
}

const ORIGIN = 'https://lab.example';

function stubBox(el: HTMLElement, box: { x: number; y: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      top: box.y,
      left: box.x,
      right: box.x + box.width,
      bottom: box.y + box.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('T029-R1 visual binding + affordance + evidence', () => {
  beforeEach(() => {
    resetTokenCounters();
    document.body.innerHTML = '';
  });

  it('R1-F001: OCR-fused painted canvas is clickable after a small word box', async () => {
    document.body.innerHTML = `<canvas id="painted_surface" width="420" height="72"></canvas>`;
    const canvas = document.getElementById('painted_surface');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing canvas');
    stubBox(canvas, { x: 20, y: 20, width: 420, height: 72 });
    let activated = false;
    canvas.addEventListener('click', () => {
      activated = true;
    });

    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    const canvasEl = scene.elements.find((el) => el.tagName === 'canvas');
    expect(canvasEl).toBeDefined();
    const canvasRegion = scene.visualRegions?.find((region) => region.kind === 'canvas');
    expect(canvasRegion).toBeDefined();
    const roiId = `roi_${canvasRegion?.regionId}`;
    const engine = new MockOcrEngine({
      [roiId]: [{ text: 'NEXT STEP', confidence: 0.92, bbox: { x: 28, y: 22, width: 64, height: 16 } }],
    });
    const perception = await runPerception({
      scene,
      engine,
      capture: async (rois) =>
        rois.map(
          (roi) =>
            new PixelBuffer(roi.roiId, roi.widthPx, roi.heightPx, new Uint8ClampedArray(roi.widthPx * roi.heightPx * 4))
        ),
      goal: 'Click the painted NEXT STEP control',
      origin: ORIGIN,
    });
    expect(perception.fusedElementIds).toContain(canvasEl?.id);

    const fusedScene = { ...scene, elements: applyFusionLabels(scene.elements, perception.candidates) };
    const vault = new PrivateTokenVault();
    const taskId = createTaskId('task-r1-visual');
    const safe = buildSafeContext(
      fusedScene,
      'Click the painted NEXT STEP control',
      evaluatePrivacyPolicy([]),
      vault,
      taskId,
      [],
      { visualCandidates: perception.candidates }
    );
    const planned = await new DeterministicPlanner().proposeAction(safe);
    expect(planned.proposal.type).toBe('CLICK');
    expect(planned.proposal.targetId).toBe(canvasEl?.id);
    const validated = validateActionProposal(planned.proposal, fusedScene, vault, taskId, scene.origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    expect(activated).toBe(true);
  });

  it('R1-F001b: two overlapping painted surfaces stay ASK_USER', () => {
    const box = { x: 0, y: 0, width: 80, height: 24 };
    const a: SafeElement = {
      id: createElementId('e1'),
      role: 'canvas',
      safeLabel: 'NEXT STEP',
      inputType: null,
      isEnabled: true,
      bbox: box,
    };
    const b: SafeElement = {
      id: createElementId('e2'),
      role: 'canvas',
      safeLabel: 'NEXT STEP',
      inputType: null,
      isEnabled: true,
      bbox: box,
    };
    const pick = pickUniqueClickTarget([a, b], ['next', 'step']);
    expect(pick.ok).toBe(false);
    if (!pick.ok) expect(pick.reason).toBe('ambiguous');
  });

  it('R1-F001c: unlabeled canvas is not a click guess', () => {
    const pick = pickUniqueClickTarget(
      [
        {
          id: createElementId('e1'),
          role: 'canvas',
          safeLabel: '',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 80, height: 24 },
        },
      ],
      ['next', 'step']
    );
    expect(pick.ok).toBe(false);
  });

  it('R1-F002: exact accessible name wins a token-coverage tie', () => {
    const pick = pickUniqueClickTarget(
      [
        {
          id: createElementId('e1'),
          role: 'link',
          safeLabel: 'Marie Curie',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 80, height: 24 },
        },
        {
          id: createElementId('e2'),
          role: 'link',
          safeLabel: 'Marie Curie Institute',
          inputType: null,
          isEnabled: true,
          bbox: { x: 80, y: 0, width: 80, height: 24 },
        },
        {
          id: createElementId('e3'),
          role: 'link',
          safeLabel: 'Marie Curie: The Biography',
          inputType: null,
          isEnabled: true,
          bbox: { x: 160, y: 0, width: 80, height: 24 },
        },
      ],
      ['marie', 'curie']
    );
    expect(pick.ok).toBe(true);
    if (pick.ok) expect(pick.target.safeLabel).toBe('Marie Curie');
  });

  it('R1-F003: unique listbox option with Search is a SEARCH_COMMIT', () => {
    const pick = pickUniqueSearchSubmitTarget([
      {
        id: createElementId('e1'),
        role: 'combobox',
        safeLabel: 'Search',
        inputType: 'text',
        isEnabled: true,
        bbox: box(0),
      },
      {
        id: createElementId('e2'),
        role: 'option',
        safeLabel: 'Search all of catalog',
        isEnabled: true,
        inputType: null,
        bbox: box(40),
      },
      {
        id: createElementId('e3'),
        role: 'option',
        safeLabel: 'other-package',
        isEnabled: true,
        inputType: null,
        bbox: box(80),
      },
    ]);
    expect(pick.ok).toBe(true);
    if (pick.ok) expect(pick.target.safeLabel).toBe('Search all of catalog');
  });

  it('R1-F003b: two Search popup options stay ASK_USER', () => {
    const pick = pickUniqueSearchSubmitTarget([
      {
        id: createElementId('e2'),
        role: 'option',
        safeLabel: 'Search all of catalog',
        isEnabled: true,
        inputType: null,
        bbox: box(0),
      },
      {
        id: createElementId('e3'),
        role: 'option',
        safeLabel: 'Search in this collection',
        isEnabled: true,
        inputType: null,
        bbox: box(40),
      },
    ]);
    expect(pick.ok).toBe(false);
    if (!pick.ok) expect(pick.reason).toBe('ambiguous');
  });

  it('R1-F004: ASK_USER report must not imply task VERIFIED_SUCCESS', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.goal = 'Click the painted NEXT STEP control';
    state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    state.evidence.executionResult = 'OK';
    state.askUser = {
      reason: 'TARGET_NOT_FOUND',
      headline: 'I need your help',
      message: 'No unique supported control matched this request.',
      hint: 'Rewrite',
      continueLabel: 'Continue',
      dismissLabel: 'Cancel',
      technicalDetail: 'TARGET_NOT_FOUND',
    };
    const ledger = new EvidenceLedger();
    ledger.begin('task-r1-report');
    ledger.record('TASK_RECEIVED', 'USER INTENT', 'goal');
    ledger.record('OCR_USED', 'VISUAL PERCEPTION', 'rois=1');
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-r1-report' });
    expect(report.result).toBe('COULD NOT COMPLETE');
    expect(report.human.whatHappened).not.toBe('VERIFIED_SUCCESS');
    expect(report.human.whatHappened).toMatch(/did not complete/i);
    expect(report.human.whatDid.toLowerCase()).toMatch(/no browser action|not the requested task/);
  });

  it('R1-F005: empty password is a control, not a leaked value', () => {
    const findings = detectElementPrivacy({
      id: createElementId('e1'),
      tagName: 'input',
      role: 'textbox',
      ariaLabel: 'Password',
      innerTextCandidate: 'Password',
      inputType: 'password',
      isEnabled: true,
      hasValue: false,
      bbox: { x: 0, y: 0, width: 80, height: 24 },
    });
    const pw = findings.find((f) => f.privacyClass === 'SECRET_PASSWORD');
    expect(pw?.valuePresent).toBe(false);
  });

  it('R1-F006: ISBN-like prose is not PII_PHONE', () => {
    const findings = detectElementPrivacy({
      id: createElementId('e1'),
      tagName: 'p',
      role: null,
      ariaLabel: null,
      innerTextCandidate: 'ISBN 978-0-306-40615-7',
      inputType: null,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 200, height: 20 },
    });
    expect(findings.some((f) => f.privacyClass === 'PII_PHONE')).toBe(false);
  });

  it('R1-F006b: unstructured 10-digit page ids are not US telephones', () => {
    const findings = detectElementPrivacy({
      id: createElementId('e1'),
      tagName: 'a',
      role: 'link',
      ariaLabel: null,
      innerTextCandidate: 'Revision 1234567890',
      inputType: null,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 200, height: 20 },
    });
    expect(findings.some((f) => f.privacyClass === 'PII_PHONE')).toBe(false);
  });

  it('R1-F007: wrong-destination search must not task-complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for WidgetAlpha',
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
      outcomeEvidenceHay: 'https://lab.example/unrelated Other page',
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.message).toMatch(/does not mention the requested query/i);
  });

  it('R1-F007b: wrong-destination open must not task-complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Open WidgetAlpha',
      verifiedCount: 1,
      lastVerifiedType: 'CLICK',
      verifiedClick: true,
      outcomeEvidenceHay: 'https://lab.example/unrelated Other page',
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.message).toMatch(/does not mention the requested resource/i);
  });

  it('R1-F007c: labeled click without a resource destination still completes', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Click Continue',
      verifiedCount: 1,
      lastVerifiedType: 'CLICK',
      verifiedClick: true,
      outcomeEvidenceHay: 'https://lab.example/unrelated Other page',
    });
    expect(decision.phase).toBe('COMPLETED');
  });

  it('R1-F008: occluded visual surface is not a blind click', () => {
    document.body.innerHTML = `<canvas id="under" width="200" height="60"></canvas>`;
    const canvas = document.getElementById('under');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing');
    canvas.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 200, height: 60, top: 0, left: 0, right: 200, bottom: 60, toJSON: () => ({}) }) as DOMRect;
    const mask = document.createElement('div');
    const orig = document.elementsFromPoint;
    document.elementsFromPoint = () => [mask, canvas];
    try {
      expect(clickHitTest(canvas)).toEqual({ ok: false, reason: 'occluded' });
    } finally {
      document.elementsFromPoint = orig;
    }
  });

  it('R1-F001d: degenerate OCR without ROI owner stays unbound', () => {
    const fused = groundAndFuse({
      elements: [
        {
          id: createElementId('e1'),
          tagName: 'canvas',
          role: 'canvas',
          ariaLabel: null,
          innerTextCandidate: null,
          inputType: null,
          isEnabled: true,
          bbox: { x: 20, y: 20, width: 420, height: 72 },
        },
      ],
      ocrBlocks: [
        {
          text: 'NEXT STEP',
          confidence: 0.9,
          bbox: { x: 900, y: 900, width: 10, height: 10 },
          roiId: 'roi_canvas_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    expect(fused.fusedElementIds).toHaveLength(0);
    expect(fused.candidates[0]?.elementId).toBeUndefined();
  });

  it('R1-F009: combobox listbox options are observed as live controls', () => {
    document.body.innerHTML = `
      <input id="q" role="combobox" aria-controls="hits" aria-expanded="true" aria-autocomplete="list" />
      <div id="hits" role="listbox">
        <div role="option">Search all of catalog</div>
        <div role="option">other-package</div>
      </div>
    `;
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    const labels = scene.elements.map((el) => el.innerTextCandidate);
    expect(labels).toContain('Search all of catalog');
    expect(labels).toContain('other-package');
    const option = scene.elements.find((el) => el.innerTextCandidate === 'Search all of catalog');
    expect(option?.role).toBe('option');
  });

  it('R1-F009b: treeitem SEARCH_COMMIT is click-capable', () => {
    const pick = pickUniqueSearchSubmitTarget([
      {
        id: createElementId('e1'),
        role: 'combobox',
        safeLabel: 'Search',
        inputType: 'search',
        isEnabled: true,
        bbox: box(0),
      },
      {
        id: createElementId('e2'),
        role: 'treeitem',
        safeLabel: 'Search all of catalog',
        isEnabled: true,
        inputType: null,
        bbox: box(40),
      },
    ]);
    expect(pick.ok).toBe(true);
    if (pick.ok) expect(pick.target.safeLabel).toBe('Search all of catalog');
  });
});
