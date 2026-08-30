/**
 * T019 canary leakage red-team (evaluation only).
 * Plants synthetic canaries and inspects tested channels. Does not claim universal zero leakage.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

export const T019_CANARIES = [
  'CANARY_PASSWORD_T019',
  'CANARY_OTP_T019',
  'CANARY_API_KEY_T019',
  'CANARY_SESSION_T019',
  'CANARY_EMAIL_T019@example.com',
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

function scene(elements: RawElement[]): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://bench.example/canary',
    origin: 'https://bench.example',
    title: 'Canary',
    viewport: { width: 800, height: 600 },
    elements,
    privacyFindings: [],
    timestamp: Date.now(),
  };
}

function containsAny(hay: string, needles: string[]): string[] {
  return needles.filter((n) => n.length > 3 && hay.includes(n));
}

export interface ChannelResult {
  channel: string;
  pass: boolean;
  hits: string[];
}

export function runCanaryRedTeam(reportRoots: string[] = []): {
  channels: ChannelResult[];
  tested: number;
  passed: number;
} {
  resetTokenCounters();
  const elements = [
    el({ id: createElementId('e1'), inputType: 'password', innerTextCandidate: 'CANARY_PASSWORD_T019' }),
    el({ id: createElementId('e2'), ariaLabel: 'OTP CANARY_OTP_T019' }),
    el({ id: createElementId('e3'), innerTextCandidate: 'CANARY_API_KEY_T019' }),
    el({ id: createElementId('e4'), innerTextCandidate: 'CANARY_SESSION_T019' }),
    el({ id: createElementId('e5'), innerTextCandidate: 'CANARY_EMAIL_T019@example.com', inputType: 'email' }),
  ];
  const raw = scene(elements);
  const findings = [
    ...raw.elements.flatMap((e) => detectElementPrivacy(e)),
    ...detectGoalPrivacy('Use CANARY_EMAIL_T019@example.com with password CANARY_PASSWORD_T019'),
    ...detectOcrTextPrivacy('hidden trap CANARY_API_KEY_T019', { roiId: 'trap', blockId: 'b1' }),
  ];
  const decisions = evaluatePrivacyPolicy(findings);
  const vault = new PrivateTokenVault();
  const taskId = createTaskId('canary-t019');
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
  const summary = buildPrivacySummary(findings, decisions, safe, { screenshotBytes: 0, protectedContextBytes: serialized.length });
  const receipt = buildPrivacyReceipt({
    hostname: 'bench.example',
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

  const channels: ChannelResult[] = [
    { channel: 'serialized-safecontext-or-blocked-payload', pass: containsAny(serialized, T019_CANARIES).length === 0, hits: containsAny(serialized, T019_CANARIES) },
    { channel: 'privacy-summary', pass: containsAny(JSON.stringify(summary), T019_CANARIES).length === 0, hits: containsAny(JSON.stringify(summary), T019_CANARIES) },
    { channel: 'privacy-receipt', pass: containsAny(JSON.stringify(receipt), T019_CANARIES).length === 0, hits: containsAny(JSON.stringify(receipt), T019_CANARIES) },
    { channel: 'product-state-snapshot', pass: containsAny(productBlob, T019_CANARIES).length === 0, hits: containsAny(productBlob, T019_CANARIES) },
    { channel: 'vault-realValue-not-in-safecontext', pass: containsAny(JSON.stringify(safe), T019_CANARIES).length === 0, hits: containsAny(JSON.stringify(safe), T019_CANARIES) },
  ];

  for (const root of reportRoots) {
    const hits = scanTreeForCanaries(root, T019_CANARIES);
    channels.push({ channel: `report-tree:${root}`, pass: hits.length === 0, hits });
  }

  return {
    channels,
    tested: channels.length,
    passed: channels.filter((c) => c.pass).length,
  };
}

function scanTreeForCanaries(root: string, needles: string[]): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(dir, name);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
        walk(path);
        continue;
      }
      if (!/\.(json|md|txt|log)$/i.test(name)) continue;
      let text = '';
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      for (const n of needles) {
        if (text.includes(n)) hits.push(`${path}::${n}`);
      }
    }
  };
  walk(root);
  return hits;
}
