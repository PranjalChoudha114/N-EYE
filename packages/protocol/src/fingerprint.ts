import type { InputType } from './raw-scene.js';

export interface RelativeBoundingBox {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

/**
 * TargetFingerprint represents a lightweight, local structural signature of an observed UI element.
 * It is used for future re-grounding to verify whether a currently resolved element
 * still matches the intended logical target before performing an action.
 *
 * CRITICAL PRIVACY RULE:
 * Fingerprints must NEVER contain raw input values, passwords, OTPs, or PII.
 */
export interface TargetFingerprint {
  role: string;
  tagName: string;
  inputType: InputType | null;
  normalizedLabelCandidate: string;
  relativeBbox: RelativeBoundingBox;
  digest: string;
}

/**
 * Computes a deterministic string digest from stable structural characteristics.
 */
export function computeFingerprintDigest(
  role: string,
  tagName: string,
  inputType: InputType | null,
  normalizedLabelCandidate: string,
  relBbox: RelativeBoundingBox
): string {
  const normLabel = normalizedLabelCandidate.trim().toLowerCase().slice(0, 80);
  const normRole = (role || tagName).toLowerCase();
  const normType = inputType || 'none';
  const bboxKey = `${Math.round(relBbox.xPercent)}_${Math.round(relBbox.yPercent)}_${Math.round(relBbox.widthPercent)}_${Math.round(relBbox.heightPercent)}`;

  // Deterministic lightweight hash (djb2)
  const rawKey = `${normRole}|${tagName}|${normType}|${normLabel}|${bboxKey}`;
  let hash = 5381;
  for (let i = 0; i < rawKey.length; i++) {
    hash = ((hash << 5) + hash) ^ rawKey.charCodeAt(i);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

export function createTargetFingerprint(
  role: string,
  tagName: string,
  inputType: InputType | null,
  normalizedLabelCandidate: string,
  relativeBbox: RelativeBoundingBox
): TargetFingerprint {
  const digest = computeFingerprintDigest(role, tagName, inputType, normalizedLabelCandidate, relativeBbox);
  return {
    role,
    tagName,
    inputType,
    normalizedLabelCandidate,
    relativeBbox,
    digest,
  };
}
