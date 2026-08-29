import type {
  PrivacyDecision,
  PrivacyFinding,
  RawScene,
  SafeContext,
  SafeElement,
  TaskId,
} from '@n-eye/protocol';
import type { PrivateTokenVault } from './vault.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

function sanitizeGoal(
  goal: string,
  decisions: PrivacyDecision[],
  findings: PrivacyFinding[],
  vault: PrivateTokenVault
): string {
  let cleanGoal = goal;
  const findingById = new Map(findings.map((f) => [f.findingId, f]));
  const caps = vault.getSafeCapabilities();

  // Prefer vault-exported symbols so the planner never sees a token the local vault did not bind.
  const emailToken =
    caps.find((t) => t.privacyClass === 'PII_EMAIL')?.tokenSymbol ||
    decisions.find((d) => d.privacyClass === 'PII_EMAIL' && d.tokenRole)?.tokenRole;
  const phoneToken =
    caps.find((t) => t.privacyClass === 'PII_PHONE')?.tokenSymbol ||
    decisions.find((d) => d.privacyClass === 'PII_PHONE' && d.tokenRole)?.tokenRole;

  for (const decision of decisions) {
    if (decision.decision !== 'TOKENIZE' || !decision.tokenRole) continue;
    if (decision.privacyClass === 'PII_EMAIL' || decision.privacyClass === 'PII_PHONE') continue;
    const span = findingById.get(decision.findingId)?.textSpan;
    if (span && cleanGoal.includes(span)) {
      cleanGoal = cleanGoal.split(span).join(decision.tokenRole);
    }
  }

  cleanGoal = cleanGoal.replace(EMAIL_REGEX, emailToken || '[REDACTED_PII]');
  cleanGoal = cleanGoal.replace(PHONE_REGEX, phoneToken || '[REDACTED_PII]');
  cleanGoal = cleanGoal.replace(/(?:password|passcode|secret)[:=\s]+([^\s,]+)/gi, 'password [REDACTED_SECRET]');
  cleanGoal = cleanGoal.replace(/CANARY_[A-Z0-9_]+/gi, '[REDACTED_CANARY]');

  return cleanGoal.trim().slice(0, 300);
}

/**
 * SafeContextBuilder (Zone 3 - Local Sensitive Processing)
 * OWNS: Field-by-field allowlist construction of the outbound SafeContext payload.
 * TRUST BOUNDARY: Reconstructs a clean representation from RawScene without spreading or exposing raw DOM nodes.
 * MUST NOT: Include raw form values, unsanitized task goals, or internal XPath / local identifiers.
 */
export function buildSafeContext(
  rawScene: RawScene,
  rawGoal: string,
  decisions: PrivacyDecision[],
  vault: PrivateTokenVault,
  taskId: TaskId,
  findings: PrivacyFinding[] = []
): SafeContext {
  const decisionByElement = new Map<string, PrivacyDecision>();
  const findingById = new Map(findings.map((f) => [f.findingId, f]));
  for (const d of decisions) {
    if (d.elementId) {
      decisionByElement.set(d.elementId, d);
    }
  }

  const safeElements: SafeElement[] = [];

  for (const el of rawScene.elements) {
    const decision = decisionByElement.get(el.id);
    let safeLabel = el.innerTextCandidate || el.ariaLabel || '';

    if (decision) {
      if (decision.decision === 'NEVER_SEND') {
        safeLabel = el.inputType === 'password' ? 'Password Field' : 'Auth Control';
      } else if (decision.decision === 'TOKENIZE' && decision.tokenRole) {
        const finding = findingById.get(decision.findingId);
        // Only rewrite labels that actually contained a private value, not the field type itself.
        if (finding?.textSpan) {
          safeLabel = `${decision.tokenRole} (${el.inputType || 'field'})`;
        }
      } else if (decision.decision === 'MASK') {
        safeLabel = 'Masked Field';
      }
    }

    safeLabel = safeLabel.replace(/CANARY_[A-Z0-9_]+/gi, '[PROTECTED_FIELD]').slice(0, 100);

    const safeEl: SafeElement = {
      id: el.id,
      role: el.role,
      safeLabel,
      inputType: el.inputType,
      isEnabled: el.isEnabled,
      isSelected: el.isSelected ? true : undefined,
      bbox: {
        x: el.bbox.x,
        y: el.bbox.y,
        width: el.bbox.width,
        height: el.bbox.height,
      },
    };

    safeElements.push(safeEl);
  }

  const sanitizedGoal = sanitizeGoal(rawGoal, decisions, findings, vault);

  const safeContext: SafeContext = {
    protocolVersion: '1.0.0',
    taskId,
    pageEpoch: rawScene.pageEpoch,
    sanitizedGoal,
    pageMetadata: {
      origin: rawScene.origin,
      sanitizedTitle: (rawScene.title || '').replace(/CANARY_[A-Z0-9_]+/gi, 'Page').slice(0, 100),
      viewport: {
        width: rawScene.viewport.width,
        height: rawScene.viewport.height,
      },
    },
    safeElements,
    availableTokens: vault.getSafeCapabilities(),
  };

  return safeContext;
}
