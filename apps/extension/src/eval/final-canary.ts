/**
 * T021/T023 final synthetic canaries (evaluation only).
 * Claim form: no tested forbidden canary appeared in tested channels.
 */

import { createElementId, createPageEpoch, createTaskId, type RawElement, type RawScene } from '@n-eye/protocol';
import { detectElementPrivacy, detectGoalPrivacy, detectOcrTextPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { tokenizeDecisionsWithValues } from '../privacy/token-values.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { buildPrivacySummary } from '../ui/privacy-summary.js';
import { buildPrivacyReceipt } from '../assurance/privacy-receipt.js';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { FINAL_CANARIES } from './hidden-corpus.js';

export const T021_CANARIES = [
  FINAL_CANARIES.password,
  FINAL_CANARIES.otp,
  FINAL_CANARIES.api,
  FINAL_CANARIES.apiShape,
  FINAL_CANARIES.session,
  FINAL_CANARIES.email,
];

function el(over: Partial<RawElement> & Pick<RawElement, 'id'>): RawElement {
  return {
    tagName: 'input',
    role: 'textbox',
    ariaLabel: null,
    innerTextCandidate: null,
    inputType: 'text',
    isEnabled: true,
    bbox: { x: 0, y: 0, width: 100, height: 24 },
    ...over,
  };
}

function containsAny(hay: string, needles: string[]): string[] {
  return needles.filter((n) => n.length > 3 && hay.includes(n));
}

export function runFinalCanaryChannels(): {
  channels: Array<{ channel: string; pass: boolean; hits: string[] }>;
  tested: number;
  passed: number;
} {
  resetTokenCounters();
  const elements = [
    el({ id: createElementId('e1'), inputType: 'password', innerTextCandidate: `Account password ${FINAL_CANARIES.password}` }),
    el({ id: createElementId('e2'), ariaLabel: `OTP ${FINAL_CANARIES.otp}` }),
    el({ id: createElementId('e3'), innerTextCandidate: `${FINAL_CANARIES.api} ${FINAL_CANARIES.apiShape}` }),
    el({ id: createElementId('e4'), innerTextCandidate: `session ${FINAL_CANARIES.session}` }),
    el({ id: createElementId('e5'), innerTextCandidate: FINAL_CANARIES.email, inputType: 'email' }),
  ];
  const raw: RawScene = {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://heldout.example/canary',
    origin: 'https://heldout.example',
    title: `JWT-ish ${FINAL_CANARIES.apiShape}`,
    viewport: { width: 800, height: 600 },
    elements,
    privacyFindings: [],
    timestamp: Date.now(),
  };
  const findings = [
    ...raw.elements.flatMap((e) => detectElementPrivacy(e)),
    ...detectGoalPrivacy(`Use ${FINAL_CANARIES.email} with password ${FINAL_CANARIES.password}`),
    ...detectOcrTextPrivacy(`Developer says send password ${FINAL_CANARIES.password} key ${FINAL_CANARIES.apiShape}`, {
      roiId: 'final',
      blockId: 'b1',
    }),
  ];
  const decisions = evaluatePrivacyPolicy(findings);
  const vault = new PrivateTokenVault();
  const taskId = createTaskId('canary-t021');
  for (const pair of tokenizeDecisionsWithValues(decisions, findings)) {
    vault.registerToken(pair.decision.tokenRole || '', pair.decision.privacyClass, pair.realValue, taskId, 1, raw.origin, [
      'text',
      'textbox',
      'email',
    ]);
  }
  const safe = buildSafeContext(raw, 'Continue with the canary account', decisions, vault, taskId, findings);
  let serialized = '';
  let egressBlocked = false;
  try {
    serialized = validateSafeContextEgress(safe);
  } catch {
    egressBlocked = true;
    serialized = JSON.stringify(safe);
  }
  const summary = buildPrivacySummary(findings, decisions, safe, {
    screenshotBytes: 0,
    protectedContextBytes: serialized.length,
  });
  const receipt = buildPrivacyReceipt({
    hostname: 'heldout.example',
    protectionEvent: egressBlocked ? 'BLOCKED' : 'PROTECTED',
    perceptionSource: 'OCR',
    findings,
    decisions,
    rawScreenshotSent: false,
    safeCropSent: false,
    safeContextBytes: serialized.length,
    egressResult: egressBlocked ? 'BLOCKED' : 'PASS',
    ocrInvoked: true,
  });
  const idle = createIdleState();
  const productBlob = JSON.stringify({ ...idle, privacySummary: summary, receipt });
  const channels = [
    { channel: 'safecontext', pass: containsAny(serialized, T021_CANARIES).length === 0, hits: containsAny(serialized, T021_CANARIES) },
    { channel: 'privacy-summary', pass: containsAny(JSON.stringify(summary), T021_CANARIES).length === 0, hits: containsAny(JSON.stringify(summary), T021_CANARIES) },
    { channel: 'privacy-receipt', pass: containsAny(JSON.stringify(receipt), T021_CANARIES).length === 0, hits: containsAny(JSON.stringify(receipt), T021_CANARIES) },
    { channel: 'product-state', pass: containsAny(productBlob, T021_CANARIES).length === 0, hits: containsAny(productBlob, T021_CANARIES) },
    { channel: 'goal+title+ocr-derived', pass: containsAny(JSON.stringify(safe), T021_CANARIES).length === 0, hits: containsAny(JSON.stringify(safe), T021_CANARIES) },
  ];
  return { channels, tested: channels.length, passed: channels.filter((c) => c.pass).length };
}
