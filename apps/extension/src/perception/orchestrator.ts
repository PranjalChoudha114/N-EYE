import type {
  OcrTextBlock,
  PageEpoch,
  PerceptionDecision,
  PerceptionFallback,
  PerceptionResult,
  PerceptionTimings,
  RawScene,
  RoiSpec,
} from '@n-eye/protocol';
import { decidePerception } from './adaptive-controller.js';
import { groundAndFuse, isVisualEvidenceStale, transformRoiBoxToViewport } from './grounding.js';
import type { OcrEngine } from './ocr-engine.js';
import { PixelBuffer } from './pixel-buffer.js';

export interface PerceptionCaptureFn {
  (rois: RoiSpec[]): Promise<PixelBuffer[]>;
}

function emptyTimings(ocrCold: boolean): PerceptionTimings {
  return {
    roiSelectionMs: 0,
    captureMs: 0,
    ocrInitMs: 0,
    ocrExecutionMs: 0,
    privacyMs: 0,
    groundingMs: 0,
    fusionMs: 0,
    totalMs: 0,
    ocrCold,
  };
}

function skippedResult(
  scene: RawScene,
  decision: PerceptionDecision,
  ocrCold: boolean
): PerceptionResult {
  return {
    _isLocalOnly: true,
    invoked: false,
    decision,
    ocrBlocks: [],
    candidates: [],
    groundings: [],
    timings: emptyTimings(ocrCold),
    pageEpoch: scene.pageEpoch,
    fusedElementIds: [],
  };
}

/**
 * Perception orchestrator (Zone 3).
 * OWNS: Adaptive decision → ROI capture → local OCR → grounding/fusion.
 * RAW DATA: PixelBuffer instances. Released before this function returns.
 * MAY LEAVE: OCR text blocks, visual candidates, timings (no rasters).
 * MUST NEVER LEAVE: screenshots, data URLs, RGBA arrays.
 */
export async function runPerception(args: {
  scene: RawScene;
  engine: OcrEngine;
  capture: PerceptionCaptureFn;
  goal?: string;
  origin?: string;
  currentEpoch?: PageEpoch;
}): Promise<PerceptionResult> {
  const totalStart = performance.now();
  const ocrCold = typeof args.engine.warmup === 'function' && !('isWarm' in args.engine && (args.engine as { isWarm?: boolean }).isWarm);

  const roiStart = performance.now();
  const decision = decidePerception(args.scene, { goal: args.goal, origin: args.origin });
  const roiSelectionMs = performance.now() - roiStart;

  if (!decision.escalate) {
    const result = skippedResult(args.scene, decision, false);
    result.timings.roiSelectionMs = Math.round(roiSelectionMs * 100) / 100;
    result.timings.totalMs = Math.round((performance.now() - totalStart) * 100) / 100;
    return result;
  }

  const currentEpoch = args.currentEpoch ?? args.scene.pageEpoch;
  if (isVisualEvidenceStale(args.scene.pageEpoch, currentEpoch)) {
    return {
      ...skippedResult(args.scene, decision, ocrCold),
      invoked: false,
      fallback: 'PAGE_CHANGED',
      timings: {
        ...emptyTimings(ocrCold),
        roiSelectionMs: Math.round(roiSelectionMs * 100) / 100,
        totalMs: Math.round((performance.now() - totalStart) * 100) / 100,
      },
    };
  }

  let fallback: PerceptionFallback | undefined;
  const buffers: PixelBuffer[] = [];
  const captureStart = performance.now();
  try {
    const captured = await args.capture(decision.roiSpecs);
    buffers.push(...captured);
  } catch {
    fallback = 'CAPTURE_UNAVAILABLE';
  }
  const captureMs = performance.now() - captureStart;

  if (buffers.length === 0 && !fallback) {
    fallback = 'CAPTURE_UNAVAILABLE';
  }

  let ocrInitMs = 0;
  let ocrExecutionMs = 0;
  const ocrBlocks: OcrTextBlock[] = [];

  if (!fallback) {
    try {
      if (args.engine.warmup && ocrCold) {
        const initStart = performance.now();
        ocrInitMs = await args.engine.warmup();
        if (ocrInitMs === 0) {
          ocrInitMs = performance.now() - initStart;
        }
      }
      const execStart = performance.now();
      for (const spec of decision.roiSpecs) {
        const buffer = buffers.find((b) => b.roiId === spec.roiId);
        if (!buffer || buffer.released) continue;
        const recognized = await args.engine.recognize({
          roiId: spec.roiId,
          width: buffer.width,
          height: buffer.height,
          rgba: buffer.bytes(),
        });
        if (recognized.timedOut) {
          fallback = 'OCR_TIMEOUT';
          break;
        }
        recognized.blocks.forEach((block, i) => {
          ocrBlocks.push({
            text: block.text,
            confidence: block.confidence,
            bbox: transformRoiBoxToViewport(spec.bbox, block.bbox),
            roiId: spec.roiId,
            pageEpoch: spec.pageEpoch,
            blockId: `${spec.roiId}_b${i + 1}`,
          });
        });
      }
      ocrExecutionMs = performance.now() - execStart;
    } catch {
      fallback = fallback || 'OCR_LOAD_FAILURE';
    }
  }

  for (const buffer of buffers) {
    buffer.release();
  }

  const privacyMs = 0;
  const groundStart = performance.now();
  const fused = groundAndFuse({
    elements: args.scene.elements,
    ocrBlocks,
    pageEpoch: args.scene.pageEpoch,
  });
  const groundingMs = performance.now() - groundStart;
  if (fused.fallback && !fallback) {
    fallback = fused.fallback;
  }

  return {
    _isLocalOnly: true,
    invoked: true,
    decision,
    ocrBlocks,
    candidates: fused.candidates,
    groundings: fused.groundings,
    timings: {
      roiSelectionMs: Math.round(roiSelectionMs * 100) / 100,
      captureMs: Math.round(captureMs * 100) / 100,
      ocrInitMs: Math.round(ocrInitMs * 100) / 100,
      ocrExecutionMs: Math.round(ocrExecutionMs * 100) / 100,
      privacyMs: Math.round(privacyMs * 100) / 100,
      groundingMs: Math.round(groundingMs * 100) / 100,
      fusionMs: Math.round(groundingMs * 100) / 100,
      totalMs: Math.round((performance.now() - totalStart) * 100) / 100,
      ocrCold,
    },
    fallback,
    pageEpoch: args.scene.pageEpoch,
    fusedElementIds: fused.fusedElementIds,
  };
}
