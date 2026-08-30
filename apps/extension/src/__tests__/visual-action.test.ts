/**
 * Real-equivalent visual-action path (not the T019 fixture 7/7 harness).
 * WHY: Automated visual eval scores OCR/cascade/fusion onto a synthetic BUTTON.
 * Chrome Scenario 08 fails when OCR fuses onto a canvas that Mock would not click.
 * MUST NOT: Import scenario-08 HTML or hard-code CONTINUE.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createPageEpoch, createTaskId } from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { applyFusionLabels } from '../perception/grounding.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { PixelBuffer } from '../perception/pixel-buffer.js';
import { runPerception } from '../perception/orchestrator.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';

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

describe('OCR-fused visual surface → ActionProposal → native click', () => {
  beforeEach(() => {
    resetTokenCounters();
    document.body.innerHTML = '';
  });

  it('grounds a painted canvas label and clicks that live node, not an unlabeled overlay', async () => {
    document.body.innerHTML = `
      <canvas id="painted_surface" width="420" height="72"></canvas>
      <button id="empty_overlay" type="button"></button>
    `;
    const canvas = document.getElementById('painted_surface');
    const overlay = document.getElementById('empty_overlay');
    if (!(canvas instanceof HTMLCanvasElement) || !(overlay instanceof HTMLButtonElement)) {
      throw new Error('visual-action fixture nodes missing');
    }
    stubBox(canvas, { x: 20, y: 20, width: 420, height: 72 });
    stubBox(overlay, { x: 20, y: 140, width: 220, height: 48 });

    let activated = false;
    canvas.addEventListener('click', () => {
      activated = true;
    });

    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    const canvasEl = scene.elements.find((el) => el.tagName === 'canvas');
    const overlayEl = scene.elements.find((el) => el.tagName === 'button');
    expect(canvasEl).toBeDefined();
    expect(overlayEl).toBeDefined();
    expect((canvasEl?.innerTextCandidate || '').trim()).toBe('');

    const canvasRegion = scene.visualRegions?.find((region) => region.kind === 'canvas');
    expect(canvasRegion).toBeDefined();
    const roiId = `roi_${canvasRegion?.regionId}`;
    const engine = new MockOcrEngine({
      [roiId]: [{ text: 'NEXT STEP', confidence: 0.92, bbox: { x: 12, y: 10, width: 180, height: 28 } }],
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
      origin: scene.origin,
    });
    expect(perception.invoked).toBe(true);
    expect(perception.fusedElementIds).toContain(canvasEl?.id);

    const fusedScene = { ...scene, elements: applyFusionLabels(scene.elements, perception.candidates) };
    const fusedCanvas = fusedScene.elements.find((el) => el.id === canvasEl?.id);
    expect(fusedCanvas?.innerTextCandidate).toMatch(/NEXT STEP/i);
    expect(fusedCanvas?.perceptionSource).toBe('OCR');

    const vault = new PrivateTokenVault();
    const taskId = createTaskId('task-visual-action');
    const decisions = evaluatePrivacyPolicy([]);
    const safe = buildSafeContext(fusedScene, 'Click the painted NEXT STEP control', decisions, vault, taskId, [], {
      visualCandidates: perception.candidates,
    });
    expect(JSON.stringify(safe)).not.toMatch(/data:image/i);

    const planner = new DeterministicPlanner();
    const planned = await planner.proposeAction(safe);
    expect(planned.proposal.type).toBe('CLICK');
    expect(planned.proposal.targetId).toBe(canvasEl?.id);
    expect(planned.proposal.targetId).not.toBe(overlayEl?.id);

    const validated = validateActionProposal(planned.proposal, fusedScene, vault, taskId, scene.origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    expect(activated).toBe(true);
  });
});
