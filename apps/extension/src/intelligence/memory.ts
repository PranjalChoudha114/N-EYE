/**
 * Verification-gated local user memory (Zone 3).
 *
 * OWNS: Generalized episodic / preference / failure memory and the learning eligibility gate.
 * TRUST: Webpage, OCR, Remote, and local-model text have ZERO policy-learning authority.
 * PRIVACY: In-memory SESSION only. Not the PrivateTokenVault. No chrome.storage. No raw secrets.
 * MUST NOT: Lower NEVER_SEND, risk, confirmation, schema, re-grounding, or verification.
 */

import { detectGoalPrivacy, redactKnownSecretPatterns } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy } from '../privacy/policy.js';
import type { IntentFamily, InterpretedGoal } from './types.js';

export const MEMORY_SCHEMA_VERSION = 1;
export const MAX_MEMORY_ENTRIES = 64;

export type MemoryRetention = 'EPHEMERAL_TASK' | 'SESSION';
export type LearningAuthority = 'EXPLICIT_USER_CORRECTION' | 'REPEATED_VERIFIED_CHOICE' | 'VERIFIED_TASK_OUTCOME';
export type UntrustedLearningSource = 'PAGE' | 'OCR' | 'REMOTE' | 'LOCAL_MODEL';

export interface GeneralizedEpisode {
  id: string;
  schemaVersion: 1;
  generalizedGoal: string;
  generalizedIntent: IntentFamily;
  originScope: string;
  semanticUiPattern: string;
  successfulStrategy: string;
  confidence: number;
  timestamp: number;
  expiryClass: MemoryRetention;
  provenance: LearningAuthority;
}

export interface LearningVerdict {
  eligible: boolean;
  reason: string;
  authority?: LearningAuthority;
}

const DESTRUCTIVE = /\b(delete|remove|destroy|confirm|allow once|skip confirmation|never.?send|risk)\b/i;

export function evaluateLearningEligibility(args: {
  locallyVerified: boolean;
  plannerClaimedComplete: boolean;
  userCorrected: boolean;
  userReversed: boolean;
  source: LearningAuthority | UntrustedLearningSource;
  privacyBlocked: boolean;
}): LearningVerdict {
  if (args.privacyBlocked) {
    return { eligible: false, reason: 'Privacy class is not eligible for persistence.' };
  }
  if (args.source === 'PAGE' || args.source === 'OCR' || args.source === 'REMOTE' || args.source === 'LOCAL_MODEL') {
    return { eligible: false, reason: 'Untrusted source cannot write user preference or safety memory.' };
  }
  if (!args.locallyVerified) {
    return { eligible: false, reason: 'Unverified outcomes are not learning-eligible (blocks false completion).' };
  }
  if (args.plannerClaimedComplete && !args.locallyVerified) {
    return { eligible: false, reason: 'Planner COMPLETE is not a learning authority.' };
  }
  if (args.userReversed || args.userCorrected) {
    return {
      eligible: true,
      reason: 'Explicit user correction is the strongest preference evidence.',
      authority: 'EXPLICIT_USER_CORRECTION',
    };
  }
  if (args.source === 'VERIFIED_TASK_OUTCOME') {
    return {
      eligible: true,
      reason: 'Locally verified task outcome may write generalized workflow memory.',
      authority: 'VERIFIED_TASK_OUTCOME',
    };
  }
  if (args.source === 'REPEATED_VERIFIED_CHOICE') {
    return {
      eligible: true,
      reason: 'Repeated verified choice may strengthen a preference.',
      authority: 'REPEATED_VERIFIED_CHOICE',
    };
  }
  return { eligible: false, reason: 'No admitted learning authority.' };
}

/**
 * Strip secrets/PII and refuse NEVER_SEND. Uses the existing privacy engine.
 * WHY: Learning memory must not become a second, weaker privacy taxonomy.
 */
export function sanitizeMemoryText(text: string): { ok: true; text: string } | { ok: false; reason: string } {
  const raw = (text || '').slice(0, 240);
  if (!raw.trim()) return { ok: false, reason: 'Empty memory candidate.' };
  if (/USER_MEMORY_CANARY/i.test(raw)) return { ok: false, reason: 'Memory canary is not persistable.' };
  if (DESTRUCTIVE.test(raw) && /\b(always|skip|unnecessary|remember that the user)\b/i.test(raw)) {
    return { ok: false, reason: 'Hostile policy instruction is not persistable preference.' };
  }
  const findings = detectGoalPrivacy(raw);
  const decisions = evaluatePrivacyPolicy(findings);
  if (decisions.some((d) => d.decision === 'NEVER_SEND')) {
    return { ok: false, reason: 'NEVER_SEND content cannot enter learned memory.' };
  }
  let out = redactKnownSecretPatterns(raw, '[REDACTED_SECRET]');
  for (const finding of findings) {
    if (finding.textSpan && (finding.privacyClass.startsWith('PII_') || finding.privacyClass.startsWith('SECRET_'))) {
      out = out.split(finding.textSpan).join('[REDACTED_PII]');
    }
  }
  out = out.replace(/https?:\/\/[^\s]+/gi, (url) => {
    try {
      return new URL(url).origin;
    } catch {
      return '[ORIGIN]';
    }
  });
  out = out.replace(/[?&][^=\s]+=[^&\s]+/g, '');
  return { ok: true, text: out.slice(0, 160) };
}

function originOnly(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.split('/')[0] || 'unknown';
  }
}

export class LocalUserMemory {
  private enabled = true;
  private episodes: GeneralizedEpisode[] = [];
  private seq = 0;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public size(): number {
    return this.episodes.length;
  }

  public clear(): void {
    this.episodes = [];
  }

  public inspect(): GeneralizedEpisode[] {
    return this.episodes.map((e) => ({ ...e }));
  }

  public record(input: {
    verdict: LearningVerdict;
    generalizedGoal: string;
    generalizedIntent: IntentFamily;
    originScope: string;
    semanticUiPattern: string;
    successfulStrategy: string;
  }): GeneralizedEpisode | null {
    if (!this.enabled) return null;
    if (!input.verdict.eligible || !input.verdict.authority) return null;
    const goal = sanitizeMemoryText(input.generalizedGoal);
    const pattern = sanitizeMemoryText(input.semanticUiPattern || 'ui');
    const strategy = sanitizeMemoryText(input.successfulStrategy);
    if (!goal.ok || !pattern.ok || !strategy.ok) return null;
    if (/^e\d+$/i.test(strategy.text) || DESTRUCTIVE.test(strategy.text) && /skip|bypass|low risk/i.test(strategy.text)) {
      return null;
    }
    this.seq += 1;
    const episode: GeneralizedEpisode = {
      id: `mem_${this.seq}`,
      schemaVersion: MEMORY_SCHEMA_VERSION,
      generalizedGoal: goal.text,
      generalizedIntent: input.generalizedIntent,
      originScope: originOnly(input.originScope),
      semanticUiPattern: pattern.text,
      successfulStrategy: strategy.text,
      confidence: input.verdict.authority === 'EXPLICIT_USER_CORRECTION' ? 0.9 : 0.7,
      timestamp: Date.now(),
      expiryClass: 'SESSION',
      provenance: input.verdict.authority,
    };
    this.episodes.push(episode);
    if (this.episodes.length > MAX_MEMORY_ENTRIES) {
      this.episodes = this.episodes.slice(-MAX_MEMORY_ENTRIES);
    }
    return episode;
  }

  /**
   * Ranking hints only. Never a risk/confirmation override.
   * WHY: "my repo" may prefer a verified resource; it must not prefer Delete.
   */
  public preferenceLabels(interpreted: InterpretedGoal, originScope: string): string[] {
    if (!this.enabled) return [];
    if (interpreted.preferenceHint !== 'POSSESSIVE_RESOURCE') return [];
    const origin = originOnly(originScope);
    const hits = this.episodes.filter(
      (e) =>
        e.originScope === origin &&
        (e.generalizedIntent === 'NAVIGATE' || e.generalizedIntent === 'CLICK' || e.generalizedIntent === 'FIND') &&
        !DESTRUCTIVE.test(e.successfulStrategy)
    );
    const labels = hits.map((e) => e.successfulStrategy.toLowerCase().trim()).filter(Boolean);
    return [...new Set(labels)].slice(0, 3);
  }
}

let singleton: LocalUserMemory | null = null;

export function getNalisMemory(): LocalUserMemory {
  if (!singleton) singleton = new LocalUserMemory();
  return singleton;
}

export function resetNalisMemoryForTests(): LocalUserMemory {
  singleton = new LocalUserMemory();
  return singleton;
}
