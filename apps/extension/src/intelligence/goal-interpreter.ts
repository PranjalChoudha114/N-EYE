/**
 * Deterministic goal interpreter (Zone 3).
 *
 * OWNS: Semantic normalization of user language into intent/entity/subgoals.
 * WHY: Phrase-memorizing regex is not a local LLM. Unknown goals must abstain.
 * MUST NOT: Invent COMPLETE, site-specific selectors, or extra authority.
 */

import type { IntentFamily, InterpretedGoal, SubgoalKind } from './types.js';

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
  'my',
  'me',
  'this',
]);

const RESOURCE_NOUNS = new Set([
  'repository',
  'repositories',
  'repo',
  'repos',
  'project',
  'projects',
  'page',
  'pages',
  'link',
  'website',
  'site',
  'dashboard',
]);

const CHROME_NOUN = /\b(button|link|tab|menu|icon|control)\s*$/i;

function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function normalizeHyphens(text: string): string {
  return text.replace(/[\u2010-\u2015\u2212]/g, '-');
}

/** UI-chrome nouns are click targets, not search queries. */
export function isChromeNounQuery(query: string): boolean {
  return CHROME_NOUN.test(query.trim());
}

/**
 * Tokenize an entity so "N-EYE" stays one unit.
 * WHY: Splitting on '-' dropped "n" (len<2) and left only "eye", which matches the wrong links.
 */
export function entityTokens(phrase: string): string[] {
  const lower = normalizeHyphens(phrase).toLowerCase().trim();
  if (!lower) return [];
  const hyphenated = lower.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || [];
  const collapsed = hyphenated.map((h) => h.replace(/-/g, ''));
  const parts = lower
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t) && !RESOURCE_NOUNS.has(t));
  const hyphenParts = new Set(
    hyphenated.flatMap((h) => h.split('-').filter((p) => p.length >= 2))
  );
  const filteredParts = hyphenated.length > 0 ? parts.filter((p) => !hyphenParts.has(p)) : parts;
  const resources = lower
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => RESOURCE_NOUNS.has(t));
  return uniqueTokens([...hyphenated, ...collapsed, ...filteredParts, ...resources]);
}

export function hintTokens(phrase: string): string[] {
  return uniqueTokens(
    normalizeHyphens(phrase)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !STOP.has(t))
  );
}

const TRAILING_ROLE_CHROME = /(?:\s+(?:field|control|box|area|widget))+$/i;

/**
 * Field identity phrase plus tokens.
 * WHY: "Text input field" is identity "Text input" plus a role hint, not the token "text" alone.
 * MUST NOT: Strip "text" when it is part of the visible label.
 */
export function fieldIdentityHints(phrase: string): string[] {
  const trimmed = normalizeHyphens(phrase).replace(TRAILING_ROLE_CHROME, '').replace(/^(?:the|a|an)\s+/i, '').trim();
  const source = trimmed || phrase.trim();
  const lower = source.toLowerCase();
  return uniqueTokens([lower, compactLabel(lower), ...hintTokens(source)].filter((t) => t.length >= 2));
}

export function compactLabel(text: string): string {
  return text.toLowerCase().replace(/[-_\s]/g, '');
}

export function scoreLabelAgainstHints(haystack: string, hints: string[]): number {
  const hay = haystack.toLowerCase();
  const compactHay = compactLabel(hay);
  let score = 0;
  for (const hint of hints) {
    if (!hint) continue;
    if (hay.includes(hint)) {
      score += 3;
      continue;
    }
    const compactHint = compactLabel(hint);
    if (compactHint.length >= 3 && compactHay.includes(compactHint)) {
      score += 3;
    }
  }
  return score;
}

function baseGoal(raw: string, family: IntentFamily, extras: Partial<InterpretedGoal>): InterpretedGoal {
  const subgoals = extras.subgoals || defaultSubgoals(family, extras.requiresSearchSubmit === true);
  return {
    family,
    rawGoal: raw,
    confidence: extras.confidence ?? 0.5,
    entity: extras.entity,
    tailEntity: extras.tailEntity,
    constraints: extras.constraints || [],
    fieldHints: extras.fieldHints || [],
    labelHints: extras.labelHints || [],
    queryText: extras.queryText,
    optionText: extras.optionText,
    scrollDirection: extras.scrollDirection,
    requiresSearchSubmit: extras.requiresSearchSubmit === true,
    forbidSubmit: extras.forbidSubmit === true,
    preferenceHint: extras.preferenceHint,
    subgoals,
    remainingSubgoals: extras.remainingSubgoals || [...subgoals],
    expectedPostcondition: extras.expectedPostcondition || defaultPostcondition(family),
    ambiguity: extras.ambiguity,
    source: 'DETERMINISTIC_PARSER',
  };
}

function defaultSubgoals(family: IntentFamily, searchSubmit: boolean): SubgoalKind[] {
  if (family === 'SEARCH' || searchSubmit) {
    return ['IDENTIFY_SEARCH', 'ENTER_QUERY', 'PROVE_QUERY', 'IDENTIFY_SUBMIT', 'SUBMIT', 'PROVE_SEARCH_OUTCOME'];
  }
  if (family === 'FORM_FILL') return ['FILL_FIELD', 'PROVE_FIELD'];
  if (family === 'SELECT') return ['SELECT_OPTION'];
  if (family === 'SCROLL') return ['SCROLL_VIEW'];
  if (family === 'NAVIGATE' || family === 'CLICK' || family === 'FIND') {
    return ['ACTIVATE_TARGET', 'PROVE_ACTIVATION'];
  }
  if (family === 'RECOVERY') return ['CONTINUE'];
  if (family === 'MULTI_STEP') {
    return [
      'IDENTIFY_SEARCH',
      'ENTER_QUERY',
      'PROVE_QUERY',
      'IDENTIFY_SUBMIT',
      'SUBMIT',
      'PROVE_SEARCH_OUTCOME',
      'ACTIVATE_TARGET',
      'PROVE_ACTIVATION',
    ];
  }
  return [];
}

function defaultPostcondition(family: IntentFamily): string {
  switch (family) {
    case 'SEARCH':
      return 'Typed query is present and a verified search/navigation outcome is observed.';
    case 'NAVIGATE':
    case 'CLICK':
    case 'FIND':
      return 'The named control or resource is uniquely activated.';
    case 'FORM_FILL':
      return 'The live field holds the requested text.';
    case 'SELECT':
      return 'The named option is selected on a unique native select.';
    case 'SCROLL':
      return 'Viewport or container scroll position changes or is at a boundary.';
    case 'MULTI_STEP':
      return 'Each subgoal is independently verified. Search proof is not resource-open proof.';
    default:
      return 'Safe abstention unless a unique supported action is proven.';
  }
}

function unsupported(raw: string, ambiguity?: string): InterpretedGoal {
  return baseGoal(raw, 'UNSUPPORTED', {
    confidence: 0,
    ambiguity: ambiguity || 'Goal is outside the supported intent families.',
    expectedPostcondition: 'Ask the user rather than invent success.',
  });
}

function parseSearch(g: string): InterpretedGoal | null {
  const searchFor =
    /^(?:please\s+)?search(?:\s+(?!for\b)(.+?))?\s+for\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$/i.exec(
      g
    );
  if (searchFor?.[2]) {
    const query = searchFor[2].trim();
    if (!query || isChromeNounQuery(query)) return null;
    const scope = (searchFor[1] || '').trim();
    const location = (searchFor[3] || '').trim();
    return baseGoal(g, 'SEARCH', {
      confidence: 0.93,
      entity: query,
      queryText: query,
      fieldHints: uniqueTokens(['search', ...hintTokens(scope), ...hintTokens(location)]),
      constraints: [scope, location].filter(Boolean),
      requiresSearchSubmit: true,
    });
  }

  const lookUp =
    /^(?:please\s+)?look\s+up\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$/i.exec(g);
  if (lookUp?.[1]) {
    const query = lookUp[1].trim();
    if (!query || isChromeNounQuery(query)) return null;
    return baseGoal(g, 'SEARCH', {
      confidence: 0.9,
      entity: query,
      queryText: query,
      fieldHints: uniqueTokens(['search', ...hintTokens(lookUp[2] || '')]),
      requiresSearchSubmit: true,
    });
  }

  const find =
    /^(?:please\s+)?find\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+?))?\s*$/i.exec(g);
  if (find?.[1]) {
    const query = find[1].trim();
    if (!query || isChromeNounQuery(query)) return null;
    return baseGoal(g, 'SEARCH', {
      confidence: 0.88,
      entity: query,
      queryText: query,
      fieldHints: uniqueTokens(['search', ...hintTokens(find[2] || '')]),
      requiresSearchSubmit: true,
    });
  }

  return null;
}

function parseNavigate(g: string): InterpretedGoal | null {
  const findAndOpen =
    /^(?:please\s+)?(?:find|locate)\s+["']?(.+?)["']?\s+and\s+(?:open|click|go\s+to)(?:\s+it)?\s*$/i.exec(g);
  if (findAndOpen?.[1]) {
    const entity = findAndOpen[1].trim();
    if (!entity || isChromeNounQuery(entity)) return null;
    return navigateGoal(g, entity, 0.86);
  }

  const open =
    /^(?:please\s+)?(?:open|go\s+to|navigate\s+to|visit|show(?:\s+me)?)\s+(?:the\s+)?(?:my\s+)?["']?(.+?)["']?\s*$/i.exec(
      g
    );
  if (open?.[1]) {
    const entity = open[1].trim();
    if (!entity) return null;
    if (isChromeNounQuery(entity)) {
      return baseGoal(g, 'CLICK', {
        confidence: 0.8,
        entity,
        labelHints: entityTokens(entity),
      });
    }
    return navigateGoal(g, entity, 0.85);
  }

  return null;
}

function onlyResourceNoun(entityPhrase: string): boolean {
  const tokens = entityTokens(entityPhrase);
  return tokens.length > 0 && tokens.every((t) => RESOURCE_NOUNS.has(t));
}

function navigateGoal(raw: string, entityPhrase: string, confidence: number): InterpretedGoal {
  const tokens = entityTokens(entityPhrase);
  const possessive = /\bmy\b/i.test(raw) && onlyResourceNoun(entityPhrase);
  return baseGoal(raw, 'NAVIGATE', {
    confidence: possessive ? Math.min(confidence, 0.64) : confidence,
    entity: entityPhrase,
    labelHints: tokens,
    constraints: hintTokens(entityPhrase).filter((t) => RESOURCE_NOUNS.has(t)),
    preferenceHint: possessive ? 'POSSESSIVE_RESOURCE' : undefined,
    ambiguity: possessive ? 'Possessive resource shorthand is ambiguous without verified local preference.' : undefined,
    expectedPostcondition: 'The named resource is uniquely activated.',
  });
}

/**
 * SEARCH query must not swallow a following OPEN/FIND clause.
 * WHY: "Search YouTube for CodeWithHarry and open the latest C tutorial" is two subgoals.
 */
function parseSearchThenOpen(g: string): InterpretedGoal | null {
  const searchOpen =
    /^(?:please\s+)?search(?:\s+(?!for\b)(.+?))?\s+for\s+["']?(.+?)["']?\s+and\s+(?:open|click|go\s+to)\s+(?:the\s+)?(.+)\s*$/i.exec(
      g
    );
  if (searchOpen?.[2] && searchOpen[3]) {
    const query = searchOpen[2].trim();
    const tail = searchOpen[3].trim();
    if (!query || isChromeNounQuery(query) || !tail) return null;
    const scope = (searchOpen[1] || '').trim();
    return compositeSearchOpen(g, query, tail, scope);
  }
  const lookOpen =
    /^(?:please\s+)?look\s+up\s+["']?(.+?)["']?\s+and\s+(?:open|click|go\s+to)\s+(?:the\s+)?(.+)\s*$/i.exec(g);
  if (lookOpen?.[1] && lookOpen[2]) {
    const query = lookOpen[1].trim();
    const tail = lookOpen[2].trim();
    if (!query || isChromeNounQuery(query) || !tail) return null;
    return compositeSearchOpen(g, query, tail, '');
  }
  return null;
}

function compositeSearchOpen(raw: string, query: string, tail: string, scope: string): InterpretedGoal {
  const searchGoals = defaultSubgoals('SEARCH', true);
  const openGoals = defaultSubgoals('NAVIGATE', false);
  return baseGoal(raw, 'MULTI_STEP', {
    confidence: 0.88,
    entity: query,
    tailEntity: tail,
    queryText: query,
    fieldHints: uniqueTokens(['search', ...hintTokens(scope)]),
    labelHints: entityTokens(tail),
    constraints: [scope].filter(Boolean),
    requiresSearchSubmit: true,
    subgoals: [...searchGoals, ...openGoals],
    expectedPostcondition:
      'Typed query is submitted and verified. Then the named resource is uniquely activated.',
  });
}

function parseLocateUi(g: string): InterpretedGoal | null {
  const where =
    /^(?:please\s+)?find\s+where\s+i\s+can\s+(.+?)\s*$/i.exec(g) ||
    /^(?:please\s+)?find\s+(?:the\s+)?(.+?)\s+section\s*$/i.exec(g);
  if (!where?.[1]) return null;
  const entity = where[1].trim();
  if (!entity || isChromeNounQuery(entity)) return null;
  return baseGoal(g, 'FIND', {
    confidence: 0.8,
    entity,
    labelHints: entityTokens(entity).length > 0 ? entityTokens(entity) : hintTokens(entity),
    expectedPostcondition: 'The named UI region or control becomes uniquely grounded or visible.',
  });
}

function parseFillNoSubmit(g: string): InterpretedGoal | null {
  if (!/\b(?:do\s+not|don't|dont)\s+submit\b/i.test(g)) return null;
  const stripped = g.replace(/\s+but\s+(?:do\s+not|don't|dont)\s+submit.*$/i, '').trim();
  const fillWith = /fill\s+(?:the\s+)?(.+?)\s+with\s+["']?(.+?)["']?\s*$/i.exec(stripped);
  if (fillWith?.[1] && fillWith[2]) {
    return baseGoal(g, 'FORM_FILL', {
      confidence: 0.9,
      queryText: fillWith[2].trim(),
      entity: fillWith[2].trim(),
      fieldHints: fieldIdentityHints(fillWith[1]),
      requiresSearchSubmit: false,
      forbidSubmit: true,
      constraints: ['NO_SUBMIT'],
      expectedPostcondition: 'The live field holds the requested text. The form is not submitted.',
    });
  }
  const typeIn = /(?:type|enter)\s+["']?(.+?)["']?\s+(?:in(?:to)?|on)\s+(?:the\s+)?(.+?)\s*$/i.exec(stripped);
  if (typeIn?.[1] && typeIn[2]) {
    return baseGoal(g, 'FORM_FILL', {
      confidence: 0.9,
      queryText: typeIn[1].trim(),
      entity: typeIn[1].trim(),
      fieldHints: fieldIdentityHints(typeIn[2]),
      requiresSearchSubmit: false,
      forbidSubmit: true,
      constraints: ['NO_SUBMIT'],
      expectedPostcondition: 'The live field holds the requested text. The form is not submitted.',
    });
  }
  return null;
}

function parseSubmitForm(g: string): InterpretedGoal | null {
  if (!/^(?:please\s+)?(?:click\s+(?:the\s+)?)?submit(?:\s+(?:the\s+)?form)?\s*$/i.test(g)) {
    return null;
  }
  return baseGoal(g, 'CLICK', {
    confidence: 0.93,
    entity: 'submit',
    labelHints: ['submit'],
    subgoals: ['IDENTIFY_SUBMIT', 'SUBMIT', 'PROVE_ACTIVATION'],
    expectedPostcondition: 'The form is submitted and a result state is observed.',
  });
}

function parseMultiStep(g: string): { first: string; rest: string } | null {
  // WHY: "Enter X in the Text input field and submit the form" is TYPE then SUBMIT, not one field name.
  const submitSplit = /\s+and\s+(?:then\s+)?(submit(?:\s+the\s+form)?)\s*$/i.exec(g);
  if (submitSplit && submitSplit.index !== undefined && submitSplit[1]) {
    const first = g.slice(0, submitSplit.index).trim();
    const rest = submitSplit[1].trim();
    if (first && rest) return { first, rest };
  }
  const split = /\s+(?:and\s+then|then)\s+/i.exec(g);
  if (split && split.index !== undefined) {
    const first = g.slice(0, split.index).trim();
    const rest = g.slice(split.index + split[0].length).trim();
    if (first && rest) return { first, rest };
  }
  // TYPE/FILL/SELECT then act. Do not steal search/find/open composites (those have their own parsers).
  if (!/^(?:please\s+)?(?:search|find|look\s+up|open|go\s+to|navigate\s+to|visit)\b/i.test(g)) {
    const actSplit = /\s+and\s+(?:then\s+)?((?:click|submit|continue|select)\b.*)$/i.exec(g);
    if (actSplit && actSplit.index !== undefined && actSplit[1]) {
      const first = g.slice(0, actSplit.index).trim();
      const rest = actSplit[1].trim();
      if (first && rest) return { first, rest };
    }
  }
  return null;
}

/**
 * Interpret a user goal into a structured local model.
 * PRIVACY: Operates only on the already-sanitized or raw local goal string, never vault values.
 */
export function interpretGoal(goal: string): InterpretedGoal {
  const g = goal.trim();
  if (!g) return unsupported(goal, 'Empty goal.');

  const multi = parseMultiStep(g);
  if (multi) {
    const head = interpretGoal(multi.first);
    const tail = interpretGoal(multi.rest);
    if (head.family !== 'UNSUPPORTED' && tail.family !== 'UNSUPPORTED') {
      return baseGoal(g, 'MULTI_STEP', {
        confidence: Math.min(head.confidence, tail.confidence, 0.82),
        entity: head.entity || tail.entity,
        tailEntity: tail.entity || tail.queryText,
        queryText: head.queryText,
        optionText: head.optionText || tail.optionText,
        fieldHints: head.fieldHints,
        labelHints: tail.labelHints.length > 0 ? tail.labelHints : head.labelHints,
        requiresSearchSubmit: head.requiresSearchSubmit,
        forbidSubmit: head.forbidSubmit === true || tail.forbidSubmit === true,
        preferenceHint: tail.preferenceHint || head.preferenceHint,
        constraints: [...head.constraints, ...tail.constraints],
        subgoals: [...head.subgoals, ...tail.subgoals],
        expectedPostcondition: `${head.expectedPostcondition} Then ${tail.expectedPostcondition}`,
      });
    }
  }

  const searchThenOpen = parseSearchThenOpen(g);
  if (searchThenOpen) return searchThenOpen;

  const locateUi = parseLocateUi(g);
  if (locateUi) return locateUi;

  const fillNoSubmit = parseFillNoSubmit(g);
  if (fillNoSubmit) return fillNoSubmit;

  const submitOnly = parseSubmitForm(g);
  if (submitOnly) return submitOnly;

  const navigateFirst = parseNavigate(g);
  if (navigateFirst) return navigateFirst;

  const search = parseSearch(g);
  if (search) return search;

  const typeIn =
    /^(?:please\s+)?(?:type|enter)\s+["']?(.+?)["']?\s+(?:in(?:to)?|on)\s+(?:the\s+)?(.+?)\s*$/i.exec(g);
  if (typeIn?.[1] && typeIn[2]) {
    return baseGoal(g, 'FORM_FILL', {
      confidence: 0.94,
      queryText: typeIn[1].trim(),
      entity: typeIn[1].trim(),
      fieldHints: fieldIdentityHints(typeIn[2]),
      requiresSearchSubmit: false,
    });
  }

  const fillWith = /^(?:please\s+)?fill\s+(?:the\s+)?(.+?)\s+with\s+["']?(.+?)["']?\s*$/i.exec(g);
  if (fillWith?.[1] && fillWith[2]) {
    return baseGoal(g, 'FORM_FILL', {
      confidence: 0.93,
      queryText: fillWith[2].trim(),
      entity: fillWith[2].trim(),
      fieldHints: fieldIdentityHints(fillWith[1]),
      requiresSearchSubmit: false,
    });
  }

  const selectIn = /^(?:please\s+)?select\s+["']?(.+?)["']?(?:\s+in(?:to)?\s+(?:the\s+)?(.+))?\s*$/i.exec(g);
  if (selectIn?.[1]) {
    return baseGoal(g, 'SELECT', {
      confidence: 0.9,
      optionText: selectIn[1].trim(),
      entity: selectIn[1].trim(),
      fieldHints: hintTokens(selectIn[2] || 'select'),
    });
  }

  const scroll = /^(?:please\s+)?scroll(?:\s+(up|down|left|right))?\s*$/i.exec(g);
  if (scroll) {
    const dir = (scroll[1] || 'down').toLowerCase() as 'up' | 'down' | 'left' | 'right';
    return baseGoal(g, 'SCROLL', {
      confidence: 0.95,
      scrollDirection: dir,
    });
  }

  const click = /^(?:please\s+)?click\s+(?:the\s+)?(.+?)\s*$/i.exec(g);
  if (click?.[1]) {
    const target = click[1].trim();
    return baseGoal(g, 'CLICK', {
      confidence: 0.92,
      entity: target,
      labelHints: entityTokens(target).length > 0 ? entityTokens(target) : hintTokens(target),
    });
  }

  if (/^(continue|login|sign in)\b/i.test(g)) {
    return baseGoal(g, 'RECOVERY', {
      confidence: 0.8,
      labelHints: hintTokens(g),
      entity: g,
    });
  }

  return unsupported(g);
}

export function looksLikeSearchSubmitGoal(goal: string): boolean {
  const g = goal.trim();
  if (!g || /^(?:please\s+)?(?:type|enter)\s+/i.test(g)) return false;
  const intent = interpretGoal(g);
  if (intent.family === 'SEARCH' || intent.requiresSearchSubmit) return true;
  return /(?:\bsearch\s+(?:.+\s+)?for\b|\blook\s+up\b|^\s*(?:please\s+)?find\s+)/i.test(g);
}
