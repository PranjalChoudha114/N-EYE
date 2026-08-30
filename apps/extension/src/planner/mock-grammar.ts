/**
 * Bounded Mock planner grammar (Zone 3/5 harness).
 *
 * OWNS: Deterministic interpretation of a small goal dialect for offline/demo.
 * MUST NOT: Pretend to be an LLM. Unknown goals must ASK_USER, never COMPLETE.
 * MUST NOT: Use site hostnames or CSS selectors.
 */

export type MockIntent =
  | { kind: 'type_text'; text: string; fieldHints: string[]; requiresSearchSubmit: boolean }
  | { kind: 'select'; option: string; fieldHints: string[] }
  | { kind: 'scroll'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'click_labeled'; labelHints: string[] }
  | { kind: 'unsupported' };

const STOP = new Set([
  'the',
  'a',
  'an',
  'in',
  'into',
  'on',
  'to',
  'for',
  'box',
  'field',
  'input',
  'bar',
  'area',
  'please',
]);

export function hintTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function uniqueHints(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** UI-chrome nouns are click targets, not search queries. */
function isChromeNounQuery(query: string): boolean {
  return /\b(button|link|tab|menu|icon|control)\s*$/i.test(query.trim());
}

/**
 * SEARCH / type-then-act dialect.
 * WHY: "search for X in Y search bar" must keep query=X and still require submit.
 * MUST NOT: Treat the location phrase as the typed query, or complete from typing alone.
 */
function parseSearchSubmitGoal(g: string): Extract<MockIntent, { kind: 'type_text' }> | null {
  const searchFor =
    /^(?:please\s+)?search(?:\s+(?!for\b)(.+?))?\s+for\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$/i.exec(
      g
    );
  if (searchFor?.[2]) {
    const query = searchFor[2].trim();
    if (!query || isChromeNounQuery(query)) return null;
    const scope = (searchFor[1] || '').trim();
    const location = (searchFor[3] || '').trim();
    return {
      kind: 'type_text',
      text: query,
      fieldHints: uniqueHints(['search', ...hintTokens(scope), ...hintTokens(location)]),
      requiresSearchSubmit: true,
    };
  }

  const lookUp =
    /^(?:please\s+)?look\s+up\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$/i.exec(g);
  if (lookUp?.[1]) {
    const query = lookUp[1].trim();
    if (!query || isChromeNounQuery(query)) return null;
    return {
      kind: 'type_text',
      text: query,
      fieldHints: uniqueHints(['search', ...hintTokens(lookUp[2] || '')]),
      requiresSearchSubmit: true,
    };
  }

  const find =
    /^(?:please\s+)?find\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$/i.exec(g);
  if (find?.[1]) {
    const query = find[1].trim();
    if (!query || isChromeNounQuery(query)) return null;
    return {
      kind: 'type_text',
      text: query,
      fieldHints: uniqueHints(['search', ...hintTokens(find[2] || '')]),
      requiresSearchSubmit: true,
    };
  }

  return null;
}

/**
 * Belt-and-suspenders for goals the dialect did not parse.
 * TRUST: An unclassified "search for …" must not complete from TYPE_TEXT via the generic fallback.
 */
export function looksLikeSearchSubmitGoal(goal: string): boolean {
  const g = goal.trim();
  if (!g || /^(?:please\s+)?(?:type|enter)\s+/i.test(g)) return false;
  const intent = parseSearchSubmitGoal(g);
  if (intent) return true;
  return /(?:\bsearch\s+(?:.+\s+)?for\b|\blook\s+up\b|^\s*(?:please\s+)?find\s+)/i.test(g);
}

export function parseMockGoal(goal: string): MockIntent {
  const g = goal.trim();
  if (!g) return { kind: 'unsupported' };

  const searchIntent = parseSearchSubmitGoal(g);
  if (searchIntent) return searchIntent;

  const typeIn =
    /^(?:please\s+)?(?:type|enter)\s+["']?(.+?)["']?\s+(?:in(?:to)?|on)\s+(?:the\s+)?(.+?)\s*$/i.exec(g);
  if (typeIn?.[1] && typeIn[2]) {
    return {
      kind: 'type_text',
      text: typeIn[1].trim(),
      fieldHints: hintTokens(typeIn[2]),
      requiresSearchSubmit: false,
    };
  }

  const fillWith = /^(?:please\s+)?fill\s+(?:the\s+)?(.+?)\s+with\s+["']?(.+?)["']?\s*$/i.exec(g);
  if (fillWith?.[1] && fillWith[2]) {
    return {
      kind: 'type_text',
      text: fillWith[2].trim(),
      fieldHints: hintTokens(fillWith[1]),
      requiresSearchSubmit: false,
    };
  }

  const selectIn = /^(?:please\s+)?select\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+))?\s*$/i.exec(g);
  if (selectIn?.[1]) {
    return {
      kind: 'select',
      option: selectIn[1].trim(),
      fieldHints: hintTokens(selectIn[2] || 'select'),
    };
  }

  const scroll = /^(?:please\s+)?scroll(?:\s+(up|down|left|right))?\s*$/i.exec(g);
  if (scroll) {
    const dir = (scroll[1] || 'down').toLowerCase() as 'up' | 'down' | 'left' | 'right';
    return { kind: 'scroll', direction: dir };
  }

  const click = /^(?:please\s+)?click\s+(?:the\s+)?(.+?)\s*$/i.exec(g);
  if (click?.[1]) {
    return { kind: 'click_labeled', labelHints: hintTokens(click[1]) };
  }

  if (/^(continue|submit|login|sign in)\b/i.test(g)) {
    return { kind: 'click_labeled', labelHints: hintTokens(g) };
  }

  return { kind: 'unsupported' };
}

export function isTypeTextCapable(el: {
  inputType?: string | null;
  role?: string | null;
  isEnabled?: boolean;
}): boolean {
  if (el.isEnabled === false) return false;
  const t = el.inputType || '';
  const role = (el.role || '').toLowerCase();
  if (['password', 'file', 'submit', 'button', 'checkbox', 'radio', 'select'].includes(t)) return false;
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
  return `${el.safeLabel || ''} ${el.ariaLabel || ''} ${el.innerTextCandidate || ''} ${el.role || ''} ${el.inputType || ''}`.toLowerCase();
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
  if (!isTypeTextCapable(el)) return -1;
  const hay = fieldHaystack(el);
  let score = 0;
  const role = (el.role || '').toLowerCase();
  if (el.inputType === 'search' || role === 'searchbox') score += 2;
  for (const hint of hints) {
    if (hay.includes(hint)) score += 3;
  }
  if (hints.includes('search') && (hay.includes('search') || el.inputType === 'search' || role === 'searchbox')) {
    score += 4;
  }
  return score;
}

export function pickUniqueTypeTextTarget<T extends { id: string; isEnabled?: boolean }>(
  elements: T[],
  hints: string[]
): { ok: true; target: T } | { ok: false; reason: 'none' | 'ambiguous' } {
  const capable = elements.filter((el) => isTypeTextCapable(el) && el.isEnabled !== false);
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

function isVisualSurfaceRole(role: string): boolean {
  return role === 'canvas' || role === 'img' || role === 'image';
}

function isClickCapable(el: {
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
  // TRUST: Canvas/img nodes are already registered local targets. Clicking an unlabeled
  // surface because the goal contains "canvas" is a pixel guess, not OCR grounding.
  return isVisualSurfaceRole(role) && clickLabelText(el).length > 0;
}

/**
 * Duplicate same-label clicks are guesses. ASK_USER rather than first-match.
 * WHY: First-match is nearest-control authority. Held-out duplicate/iframe cases proved it.
 */
export function scoreClickTarget(
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
  if (!isClickCapable(el)) return -1;
  const hay = fieldHaystack(el);
  let score = 0;
  for (const hint of hints) {
    if (hay.includes(hint)) score += 3;
  }
  return score;
}

export function pickUniqueClickTarget<T extends { id: string; isEnabled?: boolean }>(
  elements: T[],
  hints: string[]
): { ok: true; target: T } | { ok: false; reason: 'none' | 'ambiguous' } {
  const capable = elements.filter((el) => isClickCapable(el) && el.isEnabled !== false);
  const scored = capable.map((el) => ({ el, score: scoreClickTarget(el, hints) }));
  const positive = scored.filter((s) => s.score > 0);
  if (positive.length === 0) return { ok: false, reason: 'none' };
  const max = Math.max(...positive.map((s) => s.score));
  const winners = positive.filter((s) => s.score === max);
  if (winners.length !== 1 || !winners[0]) return { ok: false, reason: 'ambiguous' };
  return { ok: true, target: winners[0].el };
}

type SearchSubmitEl = {
  id: string;
  isEnabled?: boolean;
  role?: string | null;
  inputType?: string | null;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
};

function scoreSearchSubmitTarget(el: SearchSubmitEl): number {
  if (el.isEnabled === false) return -1;
  const role = (el.role || '').toLowerCase();
  // TRUST: Search submit is a semantic control, not an OCR canvas guess.
  if (isVisualSurfaceRole(role)) return -1;
  const inputType = el.inputType || '';
  const isControl =
    role === 'button' || inputType === 'submit' || inputType === 'button' || role === 'link';
  if (!isControl) return -1;
  const trimmed = clickLabelText(el).trim();
  if (!trimmed) return -1;
  let score = 0;
  if (inputType === 'submit') score += 5;
  if (role === 'button' || inputType === 'submit' || inputType === 'button') score += 2;
  if (/^search$/i.test(trimmed)) score += 6;
  else if (/\bsearch\b/i.test(trimmed)) score += 4;
  if (/\bsubmit\b/i.test(trimmed)) score += 4;
  if (/\bfind\b/i.test(trimmed) && !/\bsearch\b/i.test(trimmed)) score += 2;
  if (/^go$/i.test(trimmed)) score += 3;
  return score;
}

/**
 * Unique search/submit control. First-match is a guess.
 * WHY: Completing SEARCH requires acting on one submit control, or ASK_USER.
 */
export function pickUniqueSearchSubmitTarget<T extends SearchSubmitEl>(
  elements: T[]
): { ok: true; target: T } | { ok: false; reason: 'none' | 'ambiguous' } {
  const scored = elements.map((el) => ({ el, score: scoreSearchSubmitTarget(el) })).filter((s) => s.score > 0);
  if (scored.length === 0) return { ok: false, reason: 'none' };
  const max = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === max);
  if (winners.length !== 1 || !winners[0]) return { ok: false, reason: 'ambiguous' };
  return { ok: true, target: winners[0].el };
}
