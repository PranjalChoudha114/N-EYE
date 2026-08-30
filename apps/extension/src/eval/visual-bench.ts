/**
 * Shared visual evaluation runner (T009 harness reused for T019 measurement).
 * Ground truth remains bench/visual/ground-truth. This module must not invent labels.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElementId,
  createPageEpoch,
  createTaskId,
  type RawElement,
  type RawScene,
  type VisualRegion,
} from '@n-eye/protocol';
import { decidePerception } from '../perception/adaptive-controller.js';
import { groundAndFuse } from '../perception/grounding.js';
import { TesseractOcrEngine } from '../perception/tesseract-engine.js';
import { detectOcrTextPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { tokenizeDecisionsWithValues } from '../privacy/token-values.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { characterErrorRate, normalizedContains, precisionRecallF1, summarizeSamples } from './metrics.js';
import { decideModelAdmission } from './model-admission.js';

const here = dirname(fileURLToPath(import.meta.url));
export const VISUAL_REPO_ROOT = join(here, '../../../..');
const gtDir = join(VISUAL_REPO_ROOT, 'bench/visual/ground-truth');
const fixtureDir = join(here, '../../ocr-assets/fixtures');

interface OcrGt {
  id: string;
  file: string;
  expectedText: string;
  matchMode: string;
  privacyClass: string | null;
}
interface CascadeGt {
  id: string;
  kind: string;
  expectEscalate: boolean;
  expectReason?: string;
}
interface GroundingGt {
  id: string;
  kind: string;
  ocrText: string;
  ocrConfidence: number;
  expectElementId: string | null;
  expectSource?: string;
  expectFallback?: string;
}
interface PrivacyGt {
  id: string;
  text: string;
  privacyClass: string | null;
  mustNotLeak: boolean;
}
interface SplitGt {
  split: string;
  ocrFixtures: OcrGt[];
  cascade: CascadeGt[];
  grounding: GroundingGt[];
  privacyCanaries: PrivacyGt[];
}

function el(partial: Partial<RawElement> & Pick<RawElement, 'id'>): RawElement {
  return {
    tagName: 'button',
    role: 'button',
    ariaLabel: null,
    innerTextCandidate: 'Submit',
    inputType: null,
    isEnabled: true,
    bbox: { x: 10, y: 10, width: 80, height: 24 },
    ...partial,
  };
}

function baseScene(over: Partial<RawScene> = {}): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://lab.example.com/visual',
    origin: 'https://lab.example.com',
    title: 'Visual Lab',
    viewport: { width: 1280, height: 720 },
    elements: [
      el({ id: createElementId('e1'), innerTextCandidate: 'Email', inputType: 'email', tagName: 'input', role: 'textbox' }),
      el({ id: createElementId('e2'), innerTextCandidate: 'Continue' }),
    ],
    privacyFindings: [],
    timestamp: Date.now(),
    visualRegions: [],
    ...over,
  };
}

function sceneForCascade(kind: string): RawScene {
  if (kind === 'canvas') {
    const region: VisualRegion = {
      regionId: 'canvas_1',
      kind: 'canvas',
      reason: 'CANVAS_RENDERED',
      pageEpoch: createPageEpoch(1),
      bbox: { x: 20, y: 20, width: 240, height: 80 },
    };
    return baseScene({ visualRegions: [region] });
  }
  if (kind === 'image') {
    return baseScene({
      visualRegions: [
        {
          regionId: 'img_1',
          kind: 'image',
          reason: 'IMAGE_TEXT',
          pageEpoch: createPageEpoch(1),
          bbox: { x: 0, y: 0, width: 240, height: 80 },
        },
      ],
    });
  }
  if (kind === 'document') {
    return baseScene({
      visualRegions: [
        {
          regionId: 'doc_1',
          kind: 'document',
          reason: 'PDF_OR_DOCUMENT_PREVIEW',
          pageEpoch: createPageEpoch(1),
          bbox: { x: 0, y: 0, width: 240, height: 80 },
        },
      ],
    });
  }
  if (kind === 'icon') {
    return baseScene({
      elements: [el({ id: createElementId('e9'), innerTextCandidate: null, ariaLabel: null })],
    });
  }
  return baseScene();
}

function runGroundingCase(gt: GroundingGt): { elementId?: string; source?: string; fallback?: string } {
  if (gt.kind === 'ambiguous') {
    const fused = groundAndFuse({
      elements: [
        el({ id: createElementId('e1'), innerTextCandidate: null, bbox: { x: 10, y: 10, width: 40, height: 20 } }),
        el({ id: createElementId('e2'), innerTextCandidate: null, bbox: { x: 12, y: 10, width: 40, height: 20 } }),
      ],
      ocrBlocks: [
        {
          text: gt.ocrText,
          confidence: gt.ocrConfidence,
          bbox: { x: 10, y: 10, width: 42, height: 20 },
          roiId: 'roi_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    return { elementId: fused.candidates[0]?.elementId, source: fused.candidates[0]?.source, fallback: fused.fallback };
  }
  if (gt.kind === 'ocr_only') {
    const fused = groundAndFuse({
      elements: [el({ id: createElementId('e1'), innerTextCandidate: 'Far', bbox: { x: 400, y: 400, width: 80, height: 24 } })],
      ocrBlocks: [
        {
          text: gt.ocrText,
          confidence: gt.ocrConfidence,
          bbox: { x: 10, y: 10, width: 80, height: 20 },
          roiId: 'roi_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    return { elementId: fused.candidates[0]?.elementId, source: fused.candidates[0]?.source, fallback: fused.fallback };
  }
  const unlabeled = gt.kind === 'duplicate' ? 'Submit' : null;
  const fused = groundAndFuse({
    elements: [el({ id: createElementId('e1'), innerTextCandidate: unlabeled, bbox: { x: 10, y: 10, width: 100, height: 30 } })],
    ocrBlocks: [
      {
        text: gt.ocrText,
        confidence: gt.ocrConfidence,
        bbox: { x: 12, y: 12, width: 80, height: 20 },
        roiId: 'roi_1',
        pageEpoch: createPageEpoch(1),
        blockId: 'b1',
      },
    ],
    pageEpoch: createPageEpoch(1),
  });
  return { elementId: fused.candidates[0]?.elementId, source: fused.candidates[0]?.source, fallback: fused.fallback };
}

export interface VisualEvalResult {
  generatedAt: string;
  classification: 'RESULT';
  dataset: string;
  cascade: {
    correct: number;
    total: number;
    accuracy: number;
    escalateCount: number;
    domOnlyCount: number;
    unnecessaryOcrOnDomSufficient: number;
    rows: Array<Record<string, string | boolean>>;
  };
  grounding: {
    correct: number;
    total: number;
    accuracy: number;
    falseGrounding: number;
    abstain: number;
    rows: Array<Record<string, string | boolean | null | undefined>>;
  };
  ocr: {
    hits: number;
    total: number;
    accuracy: number;
    latencyMs: ReturnType<typeof summarizeSamples>;
    coldWarmupMs: number | null;
    firstRecognizeAfterWarmupMs: number | null;
    rows: Array<Record<string, string | number | boolean>>;
  };
  privacy: {
    tp: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    f1: number;
    leakCount: number;
    screenshotOutboundBytes: number;
    rows: Array<Record<string, string | number | boolean>>;
  };
  modelAdmission: { decision: string; rationale: string };
}

export async function runVisualEval(): Promise<VisualEvalResult> {
  const development = JSON.parse(readFileSync(join(gtDir, 'development.json'), 'utf8')) as SplitGt;
  const heldOut = JSON.parse(readFileSync(join(gtDir, 'held-out.json'), 'utf8')) as SplitGt;

  const cascadeRows: Array<Record<string, string | boolean>> = [];
  let cascadeCorrect = 0;
  let cascadeTotal = 0;
  let ocrInvokedOnDom = 0;
  let escalateCount = 0;
  for (const split of [development, heldOut]) {
    for (const item of split.cascade) {
      cascadeTotal += 1;
      const decision = decidePerception(sceneForCascade(item.kind));
      const ok = decision.escalate === item.expectEscalate && (!item.expectReason || decision.reasons.includes(item.expectReason as never));
      if (ok) cascadeCorrect += 1;
      if (decision.escalate) escalateCount += 1;
      if (item.kind === 'dom_labeled' && decision.escalate) ocrInvokedOnDom += 1;
      cascadeRows.push({
        split: split.split,
        id: item.id,
        predictedEscalate: decision.escalate,
        expectedEscalate: item.expectEscalate,
        pass: ok,
      });
    }
  }

  const groundingRows: Array<Record<string, string | boolean | undefined>> = [];
  let groundingCorrect = 0;
  let groundingTotal = 0;
  let falseGrounding = 0;
  let abstain = 0;
  for (const split of [development, heldOut]) {
    for (const item of split.grounding) {
      groundingTotal += 1;
      const pred = runGroundingCase(item);
      const idOk = (pred.elementId || null) === item.expectElementId;
      const sourceOk = !item.expectSource || pred.source === item.expectSource;
      const fallbackOk = !item.expectFallback || pred.fallback === item.expectFallback;
      const ok = idOk && sourceOk && fallbackOk;
      if (ok) groundingCorrect += 1;
      if (item.expectElementId && pred.elementId && pred.elementId !== item.expectElementId) falseGrounding += 1;
      if (!pred.elementId) abstain += 1;
      groundingRows.push({
        split: split.split,
        id: item.id,
        predictedId: pred.elementId,
        expectedId: item.expectElementId ?? undefined,
        pass: ok,
      });
    }
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let leakCount = 0;
  const privacyRows: Array<Record<string, string | boolean | number>> = [];
  for (const split of [development, heldOut]) {
    for (const item of split.privacyCanaries) {
      const findings = detectOcrTextPrivacy(item.text, { roiId: 'roi_eval', blockId: item.id });
      const predictedClass = item.privacyClass
        ? findings.find((f) => f.privacyClass === item.privacyClass)?.privacyClass || findings[0]?.privacyClass || null
        : findings[0]?.privacyClass || null;
      if (item.privacyClass) {
        if (findings.some((f) => f.privacyClass === item.privacyClass)) tp += 1;
        else fn += 1;
      } else if (predictedClass) {
        fp += 1;
      }
      const decisions = evaluatePrivacyPolicy(findings);
      const vault = new PrivateTokenVault();
      const taskId = createTaskId(`eval-${item.id}`);
      const scene = baseScene();
      for (const pair of tokenizeDecisionsWithValues(decisions, findings)) {
        if (!pair.decision.tokenRole) continue;
        vault.registerToken(pair.decision.tokenRole, pair.decision.privacyClass, pair.realValue, taskId, 1, scene.origin, [
          'text',
          'textbox',
          'email',
          'tel',
        ]);
      }
      const safe = buildSafeContext(scene, 'Read the visual region', decisions, vault, taskId, findings);
      let leaked = false;
      try {
        const serialized = validateSafeContextEgress(safe);
        leaked = item.mustNotLeak && serialized.includes(item.text);
      } catch {
        leaked = false;
      }
      if (leaked) leakCount += 1;
      privacyRows.push({ split: split.split, id: item.id, predictedClass: predictedClass || 'none', leaked });
    }
  }
  const pii = precisionRecallF1(tp, fp, fn);

  const engine = new TesseractOcrEngine();
  const ocrLatencies: number[] = [];
  const ocrRows: Array<Record<string, string | number | boolean>> = [];
  let ocrHits = 0;
  let ocrTotal = 0;
  let coldMs: number | null = null;
  let warmMs: number | null = null;
  try {
    const warmStart = performance.now();
    await engine.warmup();
    coldMs = performance.now() - warmStart;
    for (const split of [development, heldOut]) {
      for (const item of split.ocrFixtures) {
        ocrTotal += 1;
        const png = new Uint8Array(readFileSync(join(fixtureDir, item.file)));
        const start = performance.now();
        const result = await engine.recognize({ roiId: item.id, width: 900, height: 140, png });
        const ms = performance.now() - start;
        if (ocrLatencies.length === 0) warmMs = ms;
        ocrLatencies.push(ms);
        const text = result.blocks.map((b) => b.text).join(' ');
        const hit = normalizedContains(text, item.expectedText);
        if (hit) ocrHits += 1;
        ocrRows.push({
          split: split.split,
          id: item.id,
          predicted: text,
          expected: item.expectedText,
          cer: Number(characterErrorRate(text, item.expectedText).toFixed(3)),
          pass: hit,
          ms: Math.round(ms),
        });
      }
    }
  } finally {
    await engine.terminate();
  }

  const visualOnlyPass = groundingRows.some((r) => r['id'] === 'dev-visual-only-unlabeled' && r['pass']);
  const canvasPass = cascadeRows.some((r) => String(r['id']).includes('canvas') && r['pass']);
  const iconPass = cascadeRows.some((r) => r['id'] === 'dev-icon-escalate' && r['pass']);
  const documentPass = cascadeRows.some((r) => r['id'] === 'dev-document-escalate' && r['pass']);
  const heldOutOcr = ocrRows.filter((r) => r['split'] === 'held-out');
  const heldOutOcrUseful = heldOutOcr.filter((r) => r['pass']).length >= Math.ceil(heldOutOcr.length * 0.5);
  const admission = decideModelAdmission({
    visualOnlyGroundingPassed: Boolean(visualOnlyPass),
    canvasCasePassed: Boolean(canvasPass),
    iconCasePassed: Boolean(iconPass),
    documentCasePassed: Boolean(documentPass),
    ocrUsefulOnHeldOut: heldOutOcrUseful,
    screenshotOutboundBytes: 0,
  });

  const latency = summarizeSamples(ocrLatencies);
  return {
    generatedAt: new Date().toISOString(),
    classification: 'RESULT',
    dataset: 'bench/visual/ground-truth/{development,held-out}.json',
    cascade: {
      correct: cascadeCorrect,
      total: cascadeTotal,
      accuracy: cascadeTotal ? cascadeCorrect / cascadeTotal : 0,
      escalateCount,
      domOnlyCount: cascadeTotal - escalateCount,
      unnecessaryOcrOnDomSufficient: ocrInvokedOnDom,
      rows: cascadeRows,
    },
    grounding: {
      correct: groundingCorrect,
      total: groundingTotal,
      accuracy: groundingTotal ? groundingCorrect / groundingTotal : 0,
      falseGrounding,
      abstain,
      rows: groundingRows,
    },
    ocr: {
      hits: ocrHits,
      total: ocrTotal,
      accuracy: ocrTotal ? ocrHits / ocrTotal : 0,
      latencyMs: latency,
      coldWarmupMs: coldMs,
      firstRecognizeAfterWarmupMs: warmMs,
      rows: ocrRows,
    },
    privacy: {
      tp,
      fp,
      fn,
      precision: pii.precision,
      recall: pii.recall,
      f1: pii.f1,
      leakCount,
      screenshotOutboundBytes: 0,
      rows: privacyRows,
    },
    modelAdmission: admission,
  };
}
