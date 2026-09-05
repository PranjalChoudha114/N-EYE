/**
 * NALIS intelligence provider seam (Zone 3).
 *
 * OWNS: Constrained local/remote advice parsing. Feature-detects browser local AI.
 * TRUST: Provider output is evidence only. No JS, selectors, risk, or vault authority.
 * MUST NOT: Download weights. ADR-0015 REJECT stands until a new bench admits a model.
 */

import { interpretGoal } from './goal-interpreter.js';
import type { IntentFamily, InterpretedGoal } from './types.js';

export type ProviderHealth = 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'INITIALIZING' | 'FAILED';

export interface ConstrainedIntelOutput {
  intent: IntentFamily;
  subgoal?: string;
  candidateId?: string;
  recommendedOperation: 'CLICK' | 'TYPE_TEXT' | 'SELECT' | 'SCROLL' | 'PRESS_ENTER' | 'ASK_USER' | 'WAIT';
  reasonCode: string;
  uncertainty: string[];
}

export interface IntelligenceProvider {
  id: string;
  availability(): ProviderHealth;
  capabilities(): string[];
  infer(goal: string): ConstrainedIntelOutput | InterpretedGoal;
}

const FORBIDDEN_KEYS = /^(javascript|selector|css|xpath|risk|confirmation|vault|realValue|execute|eval)$/i;
const FORBIDDEN_VALUE = /javascript:|document\.cookie|risk\s*=\s*low|confirmation already|css\s*selector/i;

export function parseConstrainedIntel(raw: unknown): { ok: true; value: ConstrainedIntelOutput } | { ok: false; code: 'MODEL_INVALID_OUTPUT' } {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'MODEL_INVALID_OUTPUT' };
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.test(key)) return { ok: false, code: 'MODEL_INVALID_OUTPUT' };
  }
  const blob = JSON.stringify(obj);
  if (blob.length > 4000 || FORBIDDEN_VALUE.test(blob)) return { ok: false, code: 'MODEL_INVALID_OUTPUT' };
  const intent = obj['intent'];
  const op = obj['recommendedOperation'];
  if (typeof intent !== 'string' || typeof op !== 'string') return { ok: false, code: 'MODEL_INVALID_OUTPUT' };
  const allowedOps = new Set(['CLICK', 'TYPE_TEXT', 'SELECT', 'SCROLL', 'PRESS_ENTER', 'ASK_USER', 'WAIT']);
  const allowedIntent = new Set([
    'SEARCH',
    'NAVIGATE',
    'CLICK',
    'FORM_FILL',
    'SELECT',
    'FIND',
    'SCROLL',
    'MULTI_STEP',
    'RECOVERY',
    'UNSUPPORTED',
  ]);
  if (!allowedIntent.has(intent) || !allowedOps.has(op)) return { ok: false, code: 'MODEL_INVALID_OUTPUT' };
  const candidateId = obj['candidateId'];
  if (candidateId !== undefined && typeof candidateId !== 'string') return { ok: false, code: 'MODEL_INVALID_OUTPUT' };
  const subgoal = obj['subgoal'];
  const reasonCode = obj['reasonCode'];
  const uncertainty = obj['uncertainty'];
  return {
    ok: true,
    value: {
      intent: intent as IntentFamily,
      subgoal: typeof subgoal === 'string' ? subgoal : undefined,
      candidateId: typeof candidateId === 'string' ? candidateId : undefined,
      recommendedOperation: op as ConstrainedIntelOutput['recommendedOperation'],
      reasonCode: typeof reasonCode === 'string' ? reasonCode.slice(0, 80) : 'UNSPECIFIED',
      uncertainty: Array.isArray(uncertainty)
        ? uncertainty.filter((u): u is string => typeof u === 'string').slice(0, 6)
        : [],
    },
  };
}

export function detectBrowserLocalAi(): ProviderHealth {
  const g = globalThis as { LanguageModel?: unknown; ai?: { languageModel?: unknown } };
  if (g.LanguageModel || g.ai?.languageModel) return 'UNAVAILABLE';
  return 'UNAVAILABLE';
}

export function detectWebGpu(): ProviderHealth {
  const nav = globalThis as { navigator?: { gpu?: unknown } };
  if (nav.navigator?.gpu) return 'READY';
  return 'UNAVAILABLE';
}

export class DeterministicIntelligenceProvider implements IntelligenceProvider {
  public readonly id = 'DETERMINISTIC';

  public availability(): ProviderHealth {
    return 'READY';
  }

  public capabilities(): string[] {
    return ['goal_interpretation', 'task_decomposition', 'bounded_grammar'];
  }

  public infer(goal: string): InterpretedGoal {
    return interpretGoal(goal);
  }
}

export class UnadmittedLocalModelProvider implements IntelligenceProvider {
  public readonly id = 'LOCAL_MODEL';

  public availability(): ProviderHealth {
    return detectBrowserLocalAi();
  }

  public capabilities(): string[] {
    return [];
  }

  public infer(_goal: string): ConstrainedIntelOutput {
    return {
      intent: 'UNSUPPORTED',
      recommendedOperation: 'ASK_USER',
      reasonCode: 'MODEL_UNAVAILABLE',
      uncertainty: ['Local language model is not admitted (ADR-0015 / NALIS v1 REJECT).'],
    };
  }
}
