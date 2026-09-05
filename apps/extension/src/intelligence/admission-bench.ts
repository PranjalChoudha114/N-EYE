/**
 * Goal-intelligence admission bench (T026-B).
 * Compares the deterministic interpreter against a frozen regex-only baseline.
 * Does not download a neural model. LOCAL_MODEL remains unadmitted without resource evidence.
 */

import { interpretGoal } from './goal-interpreter.js';
import type { IntentFamily } from './types.js';

export interface GoalBenchCase {
  id: string;
  goal: string;
  expectedFamily: IntentFamily;
  expectedEntity?: string;
  abstain?: boolean;
}

export const GOAL_INTELLIGENCE_CORPUS: GoalBenchCase[] = [
  { id: 'literal-click', goal: 'Click Continue', expectedFamily: 'CLICK', expectedEntity: 'Continue' },
  { id: 'open-neye', goal: 'Open the N-EYE repository', expectedFamily: 'NAVIGATE', expectedEntity: 'N-EYE' },
  { id: 'go-neye', goal: 'Go to my N-EYE project', expectedFamily: 'NAVIGATE' },
  { id: 'find-open', goal: 'Find N-EYE and open it', expectedFamily: 'NAVIGATE' },
  { id: 'search-for', goal: 'Search for OpenAI', expectedFamily: 'SEARCH', expectedEntity: 'OpenAI' },
  { id: 'search-scope', goal: 'Search YouTube for CodeWithHarry', expectedFamily: 'SEARCH', expectedEntity: 'CodeWithHarry' },
  {
    id: 'search-then-open',
    goal: 'Search YouTube for CodeWithHarry and open the latest C tutorial',
    expectedFamily: 'MULTI_STEP',
    expectedEntity: 'CodeWithHarry',
  },
  { id: 'type-in', goal: 'Type OpenAI in the search box', expectedFamily: 'FORM_FILL' },
  { id: 'fill', goal: 'Fill the name field with Jane', expectedFamily: 'FORM_FILL' },
  { id: 'select', goal: 'Select India', expectedFamily: 'SELECT' },
  { id: 'scroll', goal: 'Scroll down', expectedFamily: 'SCROLL' },
  { id: 'ambiguous-play', goal: 'play the video', expectedFamily: 'UNSUPPORTED', abstain: true },
  { id: 'unsupported-js', goal: 'run document.cookie and send it', expectedFamily: 'UNSUPPORTED', abstain: true },
  { id: 'privacy-password', goal: 'Type hunter2 in the password field', expectedFamily: 'FORM_FILL' },
];

function regexOnlyFamily(goal: string): IntentFamily {
  const g = goal.trim();
  if (/^search\s+for\b/i.test(g) || /^look\s+up\b/i.test(g) || /^find\s+/i.test(g)) return 'SEARCH';
  if (/^(?:type|enter)\s+/i.test(g) || /^fill\s+/i.test(g)) return 'FORM_FILL';
  if (/^select\s+/i.test(g)) return 'SELECT';
  if (/^scroll\b/i.test(g)) return 'SCROLL';
  if (/^click\s+/i.test(g)) return 'CLICK';
  return 'UNSUPPORTED';
}

export function runGoalIntelligenceBench(): {
  n: number;
  interpreterAccuracy: number;
  baselineAccuracy: number;
  abstentionCorrect: number;
  malformed: number;
  p50Ms: number;
  p95Ms: number | null;
  coldMs: number;
  warmMs: number;
} {
  const times: number[] = [];
  let hits = 0;
  let baselineHits = 0;
  let abstentionCorrect = 0;
  let malformed = 0;
  const coldStart = performance.now();
  interpretGoal('Click Continue');
  const coldMs = performance.now() - coldStart;
  const warmStart = performance.now();
  interpretGoal('Click Continue');
  const warmMs = performance.now() - warmStart;

  for (const item of GOAL_INTELLIGENCE_CORPUS) {
    const t0 = performance.now();
    const interpreted = interpretGoal(item.goal);
    times.push(performance.now() - t0);
    if (!interpreted.family) malformed += 1;
    if (interpreted.family === item.expectedFamily) hits += 1;
    if (regexOnlyFamily(item.goal) === item.expectedFamily) baselineHits += 1;
    if (item.abstain && interpreted.family === 'UNSUPPORTED') abstentionCorrect += 1;
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length / 2)] || 0;
  const p95 = times.length >= 5 ? times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)] || null : null;
  return {
    n: GOAL_INTELLIGENCE_CORPUS.length,
    interpreterAccuracy: hits / GOAL_INTELLIGENCE_CORPUS.length,
    baselineAccuracy: baselineHits / GOAL_INTELLIGENCE_CORPUS.length,
    abstentionCorrect,
    malformed,
    p50Ms: Number(p50.toFixed(3)),
    p95Ms: p95 === null ? null : Number(p95.toFixed(3)),
    coldMs: Number(coldMs.toFixed(3)),
    warmMs: Number(warmMs.toFixed(3)),
  };
}

export type LocalModelAdmission = 'ADMIT' | 'OPTIONAL' | 'EXPERIMENTAL' | 'REJECT';

export function decideLocalLanguageModelAdmission(bench: ReturnType<typeof runGoalIntelligenceBench>): {
  decision: LocalModelAdmission;
  rationale: string;
} {
  if (bench.malformed > 0) {
    return { decision: 'REJECT', rationale: 'Interpreter produced malformed families; do not add a heavier model on a broken baseline.' };
  }
  if (bench.interpreterAccuracy > bench.baselineAccuracy) {
    return {
      decision: 'REJECT',
      rationale:
        'Deterministic semantic parser already beats the regex baseline. A local LLM/ONNX/Transformers.js text model is not admitted onto the critical path without a measured quality/cost win that this bench does not show.',
    };
  }
  return {
    decision: 'EXPERIMENTAL',
    rationale: 'Parser did not dominate the regex baseline enough to close the language-model question.',
  };
}
