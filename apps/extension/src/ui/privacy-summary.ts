/**
 * Compact privacy facts for the product UI.
 * OWNS: Class names and token symbols only.
 * MUST NEVER: Include vault realValue, raw passwords, OTPs, or raw emails in product copy.
 */

import type { PrivacyDecision, PrivacyFinding, SafeContext } from '@n-eye/protocol';
import { humanClassName } from '../assurance/protection-state.js';

export interface TokenizedFact {
  label: string;
  token: string;
}

export interface PrivacySummary {
  sensitiveCount: number;
  /** Empty password/email/tel controls. Not private values. */
  sensitiveControlCount?: number;
  keptLocal: string[];
  tokenized: TokenizedFact[];
  screenshotBytes: number;
  protectedContextBytes: number;
}

export function buildPrivacySummary(
  findings: PrivacyFinding[] | null,
  decisions: PrivacyDecision[] | null,
  safeContext: SafeContext | null,
  options?: { screenshotBytes?: number; protectedContextBytes?: number }
): PrivacySummary | null {
  if (!findings || !decisions || !safeContext) return null;

  const keptLocal = unique(
    decisions.filter((d) => d.decision === 'NEVER_SEND').map((d) => humanClassName(d.privacyClass))
  );
  const tokenized: TokenizedFact[] = [];
  for (const token of safeContext.availableTokens) {
    tokenized.push({
      label: humanClassName(token.privacyClass),
      token: token.tokenSymbol,
    });
  }

  const valueFindings = findings.filter((f) => f.valuePresent !== false);
  const controlOnly = findings.filter((f) => f.valuePresent === false);

  return {
    sensitiveCount: valueFindings.length,
    sensitiveControlCount: controlOnly.length,
    keptLocal,
    tokenized,
    screenshotBytes: options?.screenshotBytes ?? 0,
    protectedContextBytes: options?.protectedContextBytes ?? 0,
  };
}

export function boundaryVisualization(summary: PrivacySummary): {
  browser: string[];
  local: string[];
  cloud: string[];
} {
  const browser = unique([...summary.keptLocal, ...summary.tokenized.map((t) => t.label)]);
  const local = [
    ...summary.tokenized.map((t) => `${t.label} hidden from the AI`),
    ...summary.keptLocal.map((name) => `${name} stayed on your device`),
  ];
  const cloud = [
    `Protected information sent to AI · ${summary.protectedContextBytes} B`,
    summary.screenshotBytes === 0 ? 'No screenshot was sent' : `Screenshot ${summary.screenshotBytes} B`,
  ];
  return {
    browser: browser.length > 0 ? browser : ['Public page structure'],
    local: local.length > 0 ? local : ['No personal details were hidden in this request'],
    cloud,
  };
}

export function summaryContainsRawValue(summary: PrivacySummary, secrets: string[]): boolean {
  const blob = JSON.stringify(summary);
  return secrets.some((secret) => secret.length > 3 && blob.includes(secret));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
