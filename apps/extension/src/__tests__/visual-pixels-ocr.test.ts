/**
 * Real-pixel visual-action chain (not Mock OCR).
 * WHY: Scenario 08 must depend on local OCR of pixels, not a DOM name or fixture selector.
 * MUST NOT: Hard-code site selectors or planner coordinates.
 */
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElementId, createPageEpoch, createTaskId, type RawScene } from '@n-eye/protocol';
import { TesseractOcrEngine } from '../perception/tesseract-engine.js';
import { groundAndFuse, applyFusionLabels } from '../perception/grounding.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../ocr-assets/fixtures');

describe('Pixels → local OCR → grounded ActionProposal', () => {
  it('clicks a canvas whose only name came from OCR of real PNG pixels', async () => {
    resetTokenCounters();
    const png = new Uint8Array(readFileSync(join(fixtureDir, 'canvas-target.png')));
    const engine = new TesseractOcrEngine();
    await engine.warmup();
    const recognized = await engine.recognize({
      roiId: 'roi_canvas_1',
      width: 420,
      height: 72,
      png,
    });
    const ocrText = recognized.blocks.map((b) => b.text).join(' ');
    expect(ocrText.toUpperCase()).toMatch(/CANVAS|TARGET/);

    const canvasId = createElementId('e1');
    const overlayId = createElementId('e2');
    const scene: RawScene = {
      _isLocalOnly: true,
      pageEpoch: createPageEpoch(1),
      url: 'https://lab.example/visual',
      origin: 'https://lab.example',
      title: 'Visual',
      viewport: { width: 800, height: 600 },
      timestamp: Date.now(),
      elements: [
        {
          id: canvasId,
          tagName: 'canvas',
          role: 'canvas',
          ariaLabel: null,
          innerTextCandidate: null,
          inputType: null,
          isEnabled: true,
          bbox: { x: 20, y: 20, width: 420, height: 72 },
        },
        {
          id: overlayId,
          tagName: 'button',
          role: 'button',
          ariaLabel: null,
          innerTextCandidate: null,
          inputType: 'button',
          isEnabled: true,
          bbox: { x: 20, y: 140, width: 220, height: 48 },
        },
      ],
      visualRegions: [
        {
          regionId: 'canvas_1',
          kind: 'canvas',
          reason: 'CANVAS_RENDERED',
          pageEpoch: createPageEpoch(1),
          bbox: { x: 20, y: 20, width: 420, height: 72 },
        },
      ],
      privacyFindings: [],
    };

    const fused = groundAndFuse({
      elements: scene.elements,
      ocrBlocks: recognized.blocks.map((b, i) => ({
        blockId: `b${i}`,
        text: b.text,
        confidence: b.confidence ?? 0.9,
        bbox: { x: 20 + b.bbox.x, y: 20 + b.bbox.y, width: b.bbox.width, height: b.bbox.height },
        roiId: 'roi_canvas_1',
        pageEpoch: scene.pageEpoch,
      })),
      pageEpoch: scene.pageEpoch,
    });
    expect(fused.fusedElementIds).toContain(canvasId);

    const fusedScene = { ...scene, elements: applyFusionLabels(scene.elements, fused.candidates) };
    const fusedCanvas = fusedScene.elements.find((el) => el.id === canvasId);
    expect(fusedCanvas?.innerTextCandidate).toMatch(/CANVAS|TARGET/i);
    expect(fusedCanvas?.perceptionSource).toBe('OCR');

    const vault = new PrivateTokenVault();
    const taskId = createTaskId('task-pixel-ocr');
    const goal = `Click the painted ${ocrText.trim() || 'CANVAS TARGET'} control`;
    const safe = buildSafeContext(fusedScene, goal, evaluatePrivacyPolicy([]), vault, taskId, [], {
      visualCandidates: fused.candidates,
    });
    const serialized = validateSafeContextEgress(safe);
    expect(serialized).not.toMatch(/data:image/i);
    expect(serialized).not.toMatch(/CANARY_/);

    const planned = await new DeterministicPlanner().proposeAction(safe);
    expect(planned.proposal.type).toBe('CLICK');
    expect(planned.proposal.targetId).toBe(canvasId);
    expect(planned.proposal.targetId).not.toBe(overlayId);
  }, 20000);
});
