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

export function parseMockGoal(goal: string): MockIntent {
  const g = goal.trim();
  if (!g) return { kind: 'unsupported' };

  const searchFor = /^(?:please\s+)?search\s+for\s+["']?(.+?)["']?\s*$/i.exec(g);
  if (searchFor?.[1]) {
    return {
      kind: 'type_text',
      text: searchFor[1].trim(),
      fieldHints: ['search'],
      requiresSearchSubmit: true,
    };
  }

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
