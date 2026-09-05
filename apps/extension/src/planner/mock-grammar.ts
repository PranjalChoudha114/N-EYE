/**
 * Bounded Mock planner grammar (Zone 3/5 harness).
 *
 * OWNS: Deterministic interpretation of a small goal dialect for offline/demo.
 * MUST NOT: Pretend to be an LLM. Unknown goals must ASK_USER, never COMPLETE.
 * MUST NOT: Use site hostnames or CSS selectors.
 */

import {
  entityTokens,
  interpretGoal,
  isChromeNounQuery,
  looksLikeSearchSubmitGoal,
  scoreLabelAgainstHints,
} from '../intelligence/goal-interpreter.js';
import { isSearchField } from '../intelligence/semantic-ui.js';
import {
  accessibleNameHaystack,
  describeTypeGrounding,
  scoreCanonicalTypeTarget,
  type GroundingDecisionTrace,
} from '../intelligence/canonical-control.js';
import type { InterpretedGoal } from '../intelligence/types.js';

export type MockIntent =
  | { kind: 'type_text'; text: string; fieldHints: string[]; requiresSearchSubmit: boolean }
  | { kind: 'select'; option: string; fieldHints: string[] }
  | { kind: 'scroll'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'click_labeled'; labelHints: string[] }
  | { kind: 'unsupported' };

export { hintTokens } from '../intelligence/goal-interpreter.js';
export { isChromeNounQuery, looksLikeSearchSubmitGoal };

export function toMockIntent(interpreted: InterpretedGoal): MockIntent {
  if (interpreted.family === 'SEARCH' || (interpreted.family === 'MULTI_STEP' && interpreted.requiresSearchSubmit)) {
    return {
      kind: 'type_text',
      text: interpreted.queryText || interpreted.entity || '',
      fieldHints: interpreted.fieldHints.length > 0 ? interpreted.fieldHints : ['search'],
      requiresSearchSubmit: true,
    };
  }
  if (
    interpreted.family === 'FORM_FILL' ||
    (interpreted.family === 'MULTI_STEP' && Boolean(interpreted.queryText) && !interpreted.requiresSearchSubmit)
  ) {
    return {
      kind: 'type_text',
      text: interpreted.queryText || '',
      fieldHints: interpreted.fieldHints,
      requiresSearchSubmit: false,
    };
  }
  if (
    interpreted.family === 'SELECT' ||
    (interpreted.family === 'MULTI_STEP' && Boolean(interpreted.optionText) && !interpreted.queryText)
  ) {
    return {
      kind: 'select',
      option: interpreted.optionText || interpreted.entity || '',
      fieldHints: interpreted.fieldHints,
    };
  }
  if (interpreted.family === 'SCROLL') {
    return { kind: 'scroll', direction: interpreted.scrollDirection || 'down' };
  }
  if (
    interpreted.family === 'CLICK' ||
    interpreted.family === 'NAVIGATE' ||
    interpreted.family === 'FIND' ||
    interpreted.family === 'RECOVERY' ||
    interpreted.family === 'MULTI_STEP'
  ) {
    const hints =
      interpreted.labelHints.length > 0
        ? interpreted.labelHints
        : interpreted.entity
          ? entityTokens(interpreted.entity)
          : [];
    if (hints.length === 0) return { kind: 'unsupported' };
    return { kind: 'click_labeled', labelHints: hints };
  }
  return { kind: 'unsupported' };
}

export function parseMockGoal(goal: string): MockIntent {
  return toMockIntent(interpretGoal(goal));
}

export function isTypeTextCapable(
  el: {
    inputType?: string | null;
    role?: string | null;
    isEnabled?: boolean;
  },
  hints: string[] = []
): boolean {
  if (el.isEnabled === false) return false;
  const t = el.inputType || '';
  const role = (el.role || '').toLowerCase();
  if (['file', 'submit', 'button', 'checkbox', 'radio', 'select'].includes(t)) return false;
  if (t === 'password') {
    // TRUST: Password typing is allowed only when the goal names a password control.
    return hints.some((h) => /pass/.test(h.toLowerCase()));
  }
  if (['text', 'search', 'textarea', 'email', 'tel', 'number'].includes(t)) return true;
  if (role === 'textbox' || role === 'searchbox') return true;
  if (role === 'combobox' && (t === 'text' || t === 'search' || t === '')) return true;
  return false;
}

export function fieldHaystack(el: {
  ariaLabel?: string | null;
  innerTextCandidate?: string | null;
  role?: string | null;
  inputType?: string | null;
  safeLabel?: string | null;
}): string {
  return accessibleNameHaystack(el);
}

export function scoreTypeTextTarget(
  el: {
    ariaLabel?: string | null;
    innerTextCandidate?: string | null;
    role?: string | null;
    inputType?: string | null;
    safeLabel?: string | null;
    isEnabled?: boolean;
  },
  hints: string[]
): number {
  if (!isTypeTextCapable(el, hints)) return -1;
  let score = scoreCanonicalTypeTarget(el, hints);
  if (hints.some((h) => h.toLowerCase() === 'search') && (accessibleNameHaystack(el).toLowerCase().includes('search') || isSearchField(el))) {
    score += 4;
  } else if (isSearchField(el) && hints.some((h) => /search/.test(h))) {
    score += 2;
  }
  return score;
}

export function inspectTypeGrounding<T extends { id: string; isEnabled?: boolean }>(
  task: string,
  elements: T[],
  hints: string[]
): GroundingDecisionTrace {
  const capable = elements.filter((el) => isTypeTextCapable(el, hints) && el.isEnabled !== false);
  const scored = capable.map((el) => ({ el, score: scoreTypeTextTarget(el, hints) }));
  return describeTypeGrounding(task, capable, hints, scored);
}

export function pickUniqueTypeTextTarget<T extends { id: string; isEnabled?: boolean }>(
  elements: T[],
  hints: string[]
): { ok: true; target: T } | { ok: false; reason: 'none' | 'ambiguous' } {
  const capable = elements.filter((el) => isTypeTextCapable(el, hints) && el.isEnabled !== false);
  if (capable.length === 0) return { ok: false, reason: 'none' };
  const scored = capable.map((el) => ({ el, score: scoreTypeTextTarget(el, hints) }));
  const positive = scored.filter((s) => s.score > 0);
  const pool = positive.length > 0 ? positive : scored;
  const max = Math.max(...pool.map((s) => s.score));
  const winners = pool.filter((s) => s.score === max);
  if (winners.length !== 1 || !winners[0]) return { ok: false, reason: 'ambiguous' };
  return { ok: true, target: winners[0].el };
}

function clickLabelText(el: {
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
}): string {
  return `${el.safeLabel || ''} ${el.innerTextCandidate || ''} ${el.ariaLabel || ''}`.trim();
}

const CLICK_CHROME_HINTS = new Set(['button', 'link', 'icon', 'control', 'tab', 'menu']);

/**
 * Drop UI-chrome nouns and 1–2 letter fragments when a stronger entity exists.
 * WHY: "Click the Dynamic ID Button" otherwise matches every role=button via the word "button".
 */
export function effectiveClickHints(hints: string[]): string[] {
  const strong = hints.filter((h) => h.length >= 3 && !CLICK_CHROME_HINTS.has(h));
  if (strong.length > 0) return strong;
  const residual = hints.filter((h) => !CLICK_CHROME_HINTS.has(h));
  return residual.length > 0 ? residual : hints;
}

function isVisualSurfaceRole(role: string): boolean {
  return role === 'canvas' || role === 'img' || role === 'image';
}

export function isClickCapable(el: {
  role?: string | null;
  inputType?: string | null;
  isEnabled?: boolean;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
}): boolean {
  if (el.isEnabled === false) return false;
  const role = (el.role || '').toLowerCase();
  const t = el.inputType || '';
  if (role === 'button' || role === 'link' || t === 'submit' || t === 'button') return true;
  if (role === 'a' || role === 'tab' || role === 'menuitem' || role === 'summary') return true;
  // TRUST: Popup options are live controls when they expose an accessible name. Unnamed options are guesses.
  if (
    (role === 'option' || role === 'treeitem' || role === 'row') &&
    clickLabelText(el).length > 0
  ) {
    return true;
  }
  // TRUST: Canvas/img nodes are already registered local targets. Clicking an unlabeled
  // surface because the goal contains "canvas" is a pixel guess, not OCR grounding.
  return isVisualSurfaceRole(role) && clickLabelText(el).length > 0;
}

type ClickEl = {
  id: string;
  isEnabled?: boolean;
  role?: string | null;
  inputType?: string | null;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
  regionHeading?: string | null;
};

/**
 * Duplicate same-label clicks are guesses. ASK_USER rather than first-match.
 * WHY: First-match is nearest-control authority. Held-out duplicate/iframe cases proved it.
 */
export function scoreClickTarget(
  el: ClickEl,
  hints: string[]
): number {
  if (!isClickCapable(el)) return -1;
  return scoreLabelAgainstHints(clickLabelText(el), effectiveClickHints(hints));
}

function scoreRegionClickTarget(el: ClickEl, hints: string[]): number {
  if (!isClickCapable(el)) return -1;
  const heading = (el.regionHeading || '').trim();
  if (!heading) return 0;
  return scoreLabelAgainstHints(heading, effectiveClickHints(hints));
}

export function pickUniqueClickTarget<T extends ClickEl>(
  elements: T[],
  hints: string[],
  options?: { preferredLabels?: string[] }
): { ok: true; target: T } | { ok: false; reason: 'none' | 'ambiguous' } {
  const capable = elements.filter((el) => isClickCapable(el) && el.isEnabled !== false);
  const ownScored = capable.map((el) => ({ el, score: scoreClickTarget(el, hints) }));
  const ownPositive = ownScored.filter((s) => s.score > 0);
  if (ownPositive.length > 0) {
    const max = Math.max(...ownPositive.map((s) => s.score));
    const winners = ownPositive.filter((s) => s.score === max);
    const uniquePref = uniquePreferred(
      winners.map((w) => w.el),
      options?.preferredLabels
    );
    if (uniquePref) return { ok: true, target: uniquePref };
    const uniqueExact = uniqueExactName(winners.map((w) => w.el), hints);
    if (uniqueExact) return { ok: true, target: uniqueExact };
    if (winners.length !== 1 || !winners[0]) return { ok: false, reason: 'ambiguous' };
    return { ok: true, target: winners[0].el };
  }
  // Region pass: unique heading match with a unique actionable descendant.
  // WHY: "Click the Dynamic ID Button" names the region, not the child "Click me".
  const regionScored = capable.map((el) => ({ el, score: scoreRegionClickTarget(el, hints) }));
  const regionPositive = regionScored.filter((s) => s.score > 0);
  if (regionPositive.length === 0) return { ok: false, reason: 'none' };
  const max = Math.max(...regionPositive.map((s) => s.score));
  const winners = regionPositive.filter((s) => s.score === max);
  const uniquePref = uniquePreferred(
    winners.map((w) => w.el),
    options?.preferredLabels
  );
  if (uniquePref) return { ok: true, target: uniquePref };
  if (winners.length !== 1 || !winners[0]) return { ok: false, reason: 'ambiguous' };
  return { ok: true, target: winners[0].el };
}

function unsafePreferenceHaystack(text: string): boolean {
  return /\b(delete|remove|destroy|confirm|allow|submit|password|otp)\b/i.test(text);
}

function normalizeName(text: string): string {
  return text.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * When token-coverage ties, a unique exact accessible name may win.
 * TRUST: Must not prefer shorter labels for HIGH/unsafe controls. Must not site-special-case entities.
 */
function uniqueExactName<T extends ClickEl>(winners: T[], hints: string[]): T | null {
  if (winners.length <= 1) return null;
  const phrase = normalizeName(effectiveClickHints(hints).join(' '));
  if (phrase.length < 3) return null;
  const exact = winners.filter((el) => {
    const hay = normalizeName(clickLabelText(el));
    if (!hay || unsafePreferenceHaystack(hay)) return false;
    return hay === phrase;
  });
  return exact.length === 1 && exact[0] ? exact[0] : null;
}

/**
 * Verified local preference may break an otherwise-ambiguous ranking tie.
 * TRUST: Preference cannot select destructive controls or override a unique literal match.
 */
function uniquePreferred<T extends ClickEl>(winners: T[], preferredLabels?: string[]): T | null {
  if (winners.length <= 1) return null;
  const prefs = (preferredLabels || [])
    .map((p) => p.toLowerCase().trim())
    .filter((p) => p.length >= 2 && !unsafePreferenceHaystack(p));
  if (prefs.length === 0) return null;
  const matched = winners.filter((el) => {
    const hay = clickLabelText(el).toLowerCase();
    if (unsafePreferenceHaystack(hay)) return false;
    return prefs.some((p) => hay.includes(p));
  });
  return matched.length === 1 && matched[0] ? matched[0] : null;
}

type SearchSubmitEl = {
  id: string;
  isEnabled?: boolean;
  isSelected?: boolean;
  role?: string | null;
  inputType?: string | null;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
  formSubmitting?: boolean;
  bbox?: { x: number; y: number; width: number; height: number };
};

function nearUniqueSearchField(el: SearchSubmitEl, all: SearchSubmitEl[]): boolean {
  const fields = all.filter((item) => isSearchField(item) && item.bbox);
  if (fields.length !== 1 || !fields[0]?.bbox || !el.bbox) return false;
  const search = fields[0].bbox;
  const box = el.bbox;
  const searchMidY = search.y + search.height / 2;
  const elMidY = box.y + box.height / 2;
  const closeY = Math.abs(elMidY - searchMidY) <= Math.max(search.height, box.height) + 16;
  const elRight = box.x;
  const searchRight = search.x + search.width;
  const elLeftEnd = box.x + box.width;
  const closeX =
    Math.abs(elRight - searchRight) < 96 ||
    Math.abs(search.x - elLeftEnd) < 96 ||
    (box.x >= search.x - 8 && box.x <= search.x + search.width + 96);
  return closeY && closeX;
}

function scoreSearchSubmitTarget(el: SearchSubmitEl, all: SearchSubmitEl[]): number {
  if (el.isEnabled === false) return -1;
  const role = (el.role || '').toLowerCase();
  // TRUST: Search submit is a semantic control, not an OCR canvas guess.
  if (isVisualSurfaceRole(role)) return -1;
  const inputType = el.inputType || '';
  const trimmed = clickLabelText(el).trim();
  if (/\b(voice|your voice|image|camera|lens|mic|microphone)\b/i.test(trimmed)) {
    return -1;
  }
  // SEARCH_COMMIT may be a popup option (combobox listbox), not only a native submit button.
  if (role === 'option' || role === 'menuitem' || role === 'treeitem') {
    if (!trimmed) return -1;
    if (!/\bsearch\b/i.test(trimmed) && !/\bfind\b/i.test(trimmed)) return -1;
    let popupScore = 5;
    if (/\bsearch\b/i.test(trimmed)) popupScore += 4;
    if (el.isSelected) popupScore += 2;
    return popupScore;
  }
  const isControl =
    role === 'button' ||
    inputType === 'submit' ||
    inputType === 'button' ||
    role === 'link' ||
    el.formSubmitting === true;
  if (!isControl) return -1;
  let score = 0;
  if (inputType === 'submit' || el.formSubmitting === true) score += 5;
  if (role === 'button' || inputType === 'submit' || inputType === 'button') score += 2;
  const adjacentSearch = nearUniqueSearchField(el, all);
  // TRUST: Adjacency identifies unlabeled SEARCH_ACTION (icon/SVG). It must not break a same-label Search tie.
  if (adjacentSearch && role !== 'link' && !trimmed) score += 4;
  if (!trimmed) {
    // Unlabeled controls are SEARCH_SUBMIT only with form/submit structure or unique adjacent search.
    if (!(el.formSubmitting === true || inputType === 'submit' || adjacentSearch)) {
      return -1;
    }
    return score > 0 ? Math.max(score, 1) : -1;
  }
  if (/^search$/i.test(trimmed)) score += 6;
  else if (/\bsearch\b/i.test(trimmed)) score += 4;
  if (/\bsubmit\b/i.test(trimmed)) score += 4;
  if (/\bfind\b/i.test(trimmed) && !/\bsearch\b/i.test(trimmed)) score += 2;
  if (/^go$/i.test(trimmed)) score += 3;
  return score;
}

/**
 * Unique search/submit control. First-match is a guess.
 * WHY: Completing SEARCH requires acting on one submit control, or a constrained Enter, or ASK_USER.
 */
export function pickUniqueSearchSubmitTarget<T extends SearchSubmitEl>(
  elements: T[]
): { ok: true; target: T } | { ok: false; reason: 'none' | 'ambiguous' } {
  const scored = elements.map((el) => ({ el, score: scoreSearchSubmitTarget(el, elements) })).filter((s) => s.score > 0);
  if (scored.length === 0) return { ok: false, reason: 'none' };
  const max = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === max);
  if (winners.length !== 1 || !winners[0]) return { ok: false, reason: 'ambiguous' };
  return { ok: true, target: winners[0].el };
}
