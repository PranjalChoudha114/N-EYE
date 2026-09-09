/**
 * Perception failure disposition (Zone 3).
 *
 * OWNS: Mapping OCR/capture/grounding failures to a fail-closed user outcome.
 * TRUST: Visual hints never grant execution authority. Engine failure is not grounding failure.
 * MUST NEVER: Increase egress, skip confirmation, or treat unlabeled pixels as a unique click.
 */

import type { PerceptionFallback, PerceptionSource } from '@n-eye/protocol';

export type PerceptionStopKind = 'OCR_ENGINE' | 'VISUAL_UNBOUND' | 'STALE' | 'CANCELLED' | 'STRUCTURE_FALLBACK';

const ENGINE: ReadonlySet<PerceptionFallback> = new Set([
  'CAPTURE_UNAVAILABLE',
  'OCR_LOAD_FAILURE',
  'OCR_TIMEOUT',
  'OCR_LOW_CONFIDENCE',
]);

const UNBOUND: ReadonlySet<PerceptionFallback> = new Set(['GROUNDING_AMBIGUOUS', 'NO_TEXT']);

/** Evidence/UI source must not say OCR when no text was produced (sibling of OCR_USED gating). */
export function evidencePerceptionSource(args: {
  fusedElementIds: readonly string[];
  ocrBlocks: readonly unknown[];
}): PerceptionSource {
  if (args.fusedElementIds.length > 0) return 'FUSED';
  if (args.ocrBlocks.length > 0) return 'OCR';
  return 'DOM';
}

export function classifyPerceptionFallback(fallback: PerceptionFallback | undefined): PerceptionStopKind | null {
  if (!fallback) return null;
  if (fallback === 'CANCELLED') return 'CANCELLED';
  if (fallback === 'PAGE_CHANGED') return 'STALE';
  if (ENGINE.has(fallback)) return 'OCR_ENGINE';
  if (UNBOUND.has(fallback)) return 'VISUAL_UNBOUND';
  return 'STRUCTURE_FALLBACK';
}

export function perceptionFailureUserMessage(fallback: PerceptionFallback): string {
  switch (fallback) {
    case 'CAPTURE_UNAVAILABLE':
      return 'Could not capture visible pixels. The screenshot stayed on this device.';
    case 'OCR_LOAD_FAILURE':
      return 'On-device OCR failed to start. The screenshot stayed on this device.';
    case 'OCR_TIMEOUT':
      return 'On-device OCR timed out. The screenshot stayed on this device.';
    case 'OCR_LOW_CONFIDENCE':
      return 'Visible text could not be read with enough confidence. The screenshot stayed on this device.';
    case 'NO_TEXT':
      return 'N-Eye captured pixels but found no readable text to bind to a control. VISUAL_UNBOUND';
    case 'GROUNDING_AMBIGUOUS':
      return 'N-Eye read visible text locally but could not uniquely bind it to a control. It stopped rather than guessing. VISUAL_UNBOUND';
    case 'PAGE_CHANGED':
      return 'The page changed before visual reading finished. N-Eye stopped rather than using stale pixels.';
    case 'OVERSIZED_ROI':
      return 'The visible region was too large to read safely on this device.';
    case 'UNSUPPORTED_VISUAL':
      return 'This visual surface is not a supported reading target.';
    case 'FRAME_INACCESSIBLE':
      return 'A frame needed for visual reading is not accessible. N-Eye will not guess across origins.';
    case 'CANCELLED':
      return 'Visual reading was cancelled.';
    default:
      return 'Visual reading could not finish. N-Eye stopped rather than guessing.';
  }
}
