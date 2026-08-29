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
  /**
   * Local-only neighborhood hash (parent role + sibling labels). Supporting evidence for re-grounding.
   * MUST NOT contain raw URLs, passwords, or unbound PII values.
   */
  neighborhoodHint?: string;
}

/**
 * Security-relevant identity: role, tag, input type, normalized label.
 * Geometry is supporting evidence only and is excluded here.
 */
export function computeSemanticIdentity(
  role: string,
  tagName: string,
  inputType: InputType | null,
  normalizedLabelCandidate: string
): string {
  const normLabel = normalizedLabelCandidate.trim().toLowerCase().slice(0, 80);
  const normRole = (role || tagName).toLowerCase();
  const normType = inputType || 'none';
  return `${normRole}|${tagName.toLowerCase()}|${normType}|${normLabel}`;
}

function djb2Hex(rawKey: string, prefix: string): string {
  let hash = 5381;
  for (let i = 0; i < rawKey.length; i++) {
    hash = ((hash << 5) + hash) ^ rawKey.charCodeAt(i);
  }
  return `${prefix}${(hash >>> 0).toString(16)}`;
}

/**
 * Hashes parent/sibling context without storing raw sibling text.
 * WHY: Distinguishes two "Continue" buttons in different local contexts without leaking labels outbound.
 */
export function computeNeighborhoodHint(parentRole: string, siblingLabels: string[]): string {
  const parent = (parentRole || '').trim().toLowerCase().slice(0, 40);
  const labels = siblingLabels
    .map((label) => label.trim().toLowerCase().slice(0, 40))
    .filter(Boolean)
    .sort()
    .slice(0, 8);
  return djb2Hex(`${parent}|${labels.join(',')}`, 'nh_');
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

  const rawKey = `${normRole}|${tagName}|${normType}|${normLabel}|${bboxKey}`;
  return djb2Hex(rawKey, 'fp_');
}

export function createTargetFingerprint(
  role: string,
  tagName: string,
  inputType: InputType | null,
  normalizedLabelCandidate: string,
  relativeBbox: RelativeBoundingBox,
  neighborhoodHint?: string
): TargetFingerprint {
  const digest = computeFingerprintDigest(role, tagName, inputType, normalizedLabelCandidate, relativeBbox);
  return {
    role,
    tagName,
    inputType,
    normalizedLabelCandidate,
    relativeBbox,
    digest,
    neighborhoodHint,
  };
}
