import type {
  PrivacyDecision,
  RawScene,
  SafeContext,
  SafeElement,
  TaskId,
} from '@n-eye/protocol';
import type { PrivateTokenVault } from './vault.js';

function sanitizeGoal(goal: string, decisions: PrivacyDecision[]): string {
  let cleanGoal = goal;

  // Replace any detected direct password values in goal
  cleanGoal = cleanGoal.replace(/(?:password|passcode|secret)[:=\s]+([^\s,]+)/gi, 'password [REDACTED_SECRET]');

  // Replace tokenized PII with token symbols
  for (const decision of decisions) {
    if (decision.decision === 'TOKENIZE' && decision.tokenRole) {
      // If finding had a text span in goal, replace it
      if (decision.findingId.includes('email') || decision.privacyClass === 'PII_EMAIL') {
        cleanGoal = cleanGoal.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, decision.tokenRole);
      }
    }
  }

  // Remove high-entropy canary secret tokens from goal
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
  taskId: TaskId
): SafeContext {
  const decisionByElement = new Map<string, PrivacyDecision>();
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
        // Redact any possible label secret text
        safeLabel = el.inputType === 'password' ? 'Password Field' : 'Auth Control';
      } else if (decision.decision === 'TOKENIZE' && decision.tokenRole) {
        // Use token symbol
        safeLabel = `${decision.tokenRole} (${el.inputType || 'field'})`;
      } else if (decision.decision === 'MASK') {
        safeLabel = 'Masked Field';
      }
    }

    // Ensure safeLabel has no remaining canary strings
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

  const sanitizedGoal = sanitizeGoal(rawGoal, decisions);

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
