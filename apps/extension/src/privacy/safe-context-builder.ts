import type {
  PrivacyDecision,
  PrivacyFinding,
  RawScene,
  SafeContext,
  SafeElement,
  SafeVisualHint,
  TaskId,
  VisualCandidate,
} from '@n-eye/protocol';
import { sanitizeUnicodeDeep } from '@n-eye/protocol';
import { redactKnownSecretPatterns } from './detectors.js';
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
    const span = findingById.get(decision.findingId)?.textSpan;
    if (!span || !cleanGoal.includes(span)) continue;
    // NEVER_SEND must not remain in sanitizedGoal. Egress blocking is last-line, not the only line.
    if (decision.decision === 'NEVER_SEND') {
      cleanGoal = cleanGoal.split(span).join('[REDACTED_SECRET]');
      continue;
    }
    if (decision.decision !== 'TOKENIZE' || !decision.tokenRole) continue;
    if (decision.privacyClass === 'PII_EMAIL' || decision.privacyClass === 'PII_PHONE') continue;
    cleanGoal = cleanGoal.split(span).join(decision.tokenRole);
  }

  cleanGoal = redactKnownSecretPatterns(cleanGoal, '[REDACTED_SECRET]');
  cleanGoal = cleanGoal.replace(EMAIL_REGEX, emailToken || '[REDACTED_PII]');
  cleanGoal = cleanGoal.replace(PHONE_REGEX, phoneToken || '[REDACTED_PII]');
  cleanGoal = cleanGoal.replace(/(?:password|passcode|secret)[:=\s]+([^\s,]+)/gi, 'password [REDACTED_SECRET]');
  cleanGoal = cleanGoal.replace(/CANARY_[A-Z0-9_]+/gi, '[REDACTED_CANARY]');

  return cleanGoal.trim().slice(0, 300);
}

function sanitizePublicText(
  text: string,
  decisions: PrivacyDecision[],
  findings: PrivacyFinding[]
): string {
  let clean = text;
  const findingById = new Map(findings.map((f) => [f.findingId, f]));
  for (const decision of decisions) {
    const span = findingById.get(decision.findingId)?.textSpan;
    if (!span) continue;
    if (decision.decision === 'NEVER_SEND') {
      clean = clean.split(span).join('');
    } else if (decision.decision === 'TOKENIZE' && decision.tokenRole) {
      clean = clean.split(span).join(decision.tokenRole);
    }
  }
  // Keys before phone: digit runs inside API keys must not be treated as telephone numbers.
  clean = redactKnownSecretPatterns(clean, '[PROTECTED_FIELD]');
  return clean
    .replace(EMAIL_REGEX, '[REDACTED_PII]')
    .replace(PHONE_REGEX, '[REDACTED_PII]')
    .replace(/CANARY_[A-Z0-9_]+/gi, '[PROTECTED_FIELD]')
    .replace(/OCR_(API|OTP|SESSION|PASSWORD|EMAIL|PHONE)_T007[A-Z0-9_@.]*/gi, '[PROTECTED_FIELD]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
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
  findings: PrivacyFinding[] = [],
  options?: { visualCandidates?: VisualCandidate[] }
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
    safeLabel = sanitizePublicText(safeLabel, decisions, findings);

    const safeEl: SafeElement = {
      id: el.id,
      role: el.role,
      safeLabel,
      inputType: el.inputType,
      isEnabled: el.isEnabled,
      isSelected: el.isSelected ? true : undefined,
      perceptionSource: el.perceptionSource,
      frameId:
        el.frameProvenance && el.frameProvenance.frameId !== 'top'
          ? el.frameProvenance.frameId
          : undefined,
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

  const visualHints: SafeVisualHint[] = [];
  for (const candidate of options?.visualCandidates || []) {
    if (visualHints.length >= 8) break;
    const description = sanitizePublicText(candidate.label, decisions, findings);
    if (!description || description === '[PROTECTED_FIELD]' || description === '[REDACTED_PII]') continue;
    visualHints.push({
      hintId: candidate.candidateId,
      bbox: candidate.bbox,
      description: description.slice(0, 80),
    });
  }

  const safeContext: SafeContext = {
    protocolVersion: '1.0.0',
    taskId,
    pageEpoch: rawScene.pageEpoch,
    sanitizedGoal,
    pageMetadata: {
      origin: rawScene.origin,
      // Title is page-derived text. CANARY_ replace-only was not a privacy proof.
      sanitizedTitle: sanitizePublicText(rawScene.title || 'Page', decisions, findings).slice(0, 100) || 'Page',
      viewport: {
        width: rawScene.viewport.width,
        height: rawScene.viewport.height,
      },
    },
    safeElements,
    availableTokens: vault.getSafeCapabilities(),
    visualHints: visualHints.length > 0 ? visualHints : undefined,
  };

  // WHY: Page-derived strings can carry unpaired UTF-16 surrogates. Sanitize here so
  // the planner transport never sees a payload Python cannot UTF-8 encode.
  return sanitizeUnicodeDeep(safeContext);
}
