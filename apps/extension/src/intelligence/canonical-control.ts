/**
 * Canonical control ranking helpers (Zone 3).
 *
 * OWNS: Role-compatible scoring over one logical control. Observer still materializes RawElement.
 * INVARIANT: One physical control → one logical control → multiple evidence sources.
 * MUST NOT: Put HTML inputType/role strings into identity haystacks (generic-token pollution).
 * MUST NOT: Create a second element graph beside RawElement/SafeElement.
 */

import { compactLabel, scoreLabelAgainstHints } from './goal-interpreter.js';

/** Role/type chrome. Distinguishing labels such as "Text input" keep the word "text". */
const GENERIC_IDENTITY = new Set([
  'field',
  'input',
  'text',
  'button',
  'control',
  'link',
  'box',
  'page',
  'area',
  'widget',
]);

export interface CanonicalNameFields {
  id?: string;
  role?: string | null;
  inputType?: string | null;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
  regionHeading?: string | null;
  formSubmitting?: boolean;
  isEnabled?: boolean;
  frameId?: string | null;
}

export interface GroundingCandidateTrace {
  localId: string;
  role: string;
  accessibleName: string;
  visibleText: string;
  region: string;
  formRelation: boolean;
  score: number;
}

export interface GroundingDecisionTrace {
  task: string;
  candidateCount: number;
  candidates: GroundingCandidateTrace[];
  topId?: string;
  runnerUpId?: string;
  margin: number;
  abstentionReason?: 'none' | 'ambiguous';
}

/**
 * Accessible-name haystack only. Role/inputType are hard filters, not identity.
 * WHY: Selenium "Text input" tied with every type=text when haystacks included "text".
 */
export function accessibleNameHaystack(el: CanonicalNameFields): string {
  return `${el.safeLabel || ''} ${el.ariaLabel || ''} ${el.innerTextCandidate || ''}`.replace(/\s+/g, ' ').trim();
}

export function isGenericIdentityToken(token: string): boolean {
  return GENERIC_IDENTITY.has(token.toLowerCase().trim());
}

/**
 * Hard-then-soft TYPE score. Exact/phrase label match dominates generic noun overlap.
 * Thresholds: exact +12, multi-word phrase +8, distinguishing token +3, generic token +1.
 * Dataset: Selenium-like labeled form + existing type-text fixtures. Fail closed on ties.
 */
export function scoreCanonicalTypeTarget(el: CanonicalNameFields, hints: string[]): number {
  const name = accessibleNameHaystack(el).toLowerCase();
  const compactName = compactLabel(name);
  if (!name && hints.length === 0) return 0;
  let score = 0;
  for (const hint of hints) {
    const h = hint.toLowerCase().trim();
    if (!h) continue;
    const compactHint = compactLabel(h);
    if (name === h || (compactHint.length >= 4 && compactName === compactHint)) {
      score += 12;
      continue;
    }
    if (h.includes(' ') && name.includes(h)) {
      score += 8;
      continue;
    }
    if (name.includes(h) || (compactHint.length >= 4 && compactName.includes(compactHint))) {
      score += isGenericIdentityToken(h) ? 1 : 3;
    }
  }
  return score;
}

export function describeTypeGrounding(
  task: string,
  elements: CanonicalNameFields[],
  hints: string[],
  scored: Array<{ el: CanonicalNameFields; score: number }>
): GroundingDecisionTrace {
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const runner = ranked[1];
  const candidates: GroundingCandidateTrace[] = ranked.slice(0, 12).map((row) => ({
    localId: row.el.id || '',
    role: row.el.role || '',
    accessibleName: accessibleNameHaystack(row.el),
    visibleText: row.el.innerTextCandidate || '',
    region: row.el.regionHeading || '',
    formRelation: row.el.formSubmitting === true,
    score: row.score,
  }));
  const margin = (top?.score ?? 0) - (runner?.score ?? 0);
  const winners = ranked.filter((row) => row.score === (top?.score ?? 0) && (top?.score ?? 0) > 0);
  return {
    task,
    candidateCount: elements.length,
    candidates,
    topId: top?.el.id,
    runnerUpId: runner?.el.id,
    margin,
    abstentionReason: winners.length === 1 ? undefined : winners.length === 0 ? 'none' : 'ambiguous',
  };
}

/** Click labels only — region heading is a separate pass. */
export function clickNameHaystack(el: CanonicalNameFields): string {
  return accessibleNameHaystack(el);
}

export function scoreCanonicalClickName(el: CanonicalNameFields, hints: string[]): number {
  return scoreLabelAgainstHints(clickNameHaystack(el), hints);
}
