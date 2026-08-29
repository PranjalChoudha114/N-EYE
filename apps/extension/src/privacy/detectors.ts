import type {
  ElementId,
  PrivacyFinding,
  RawElement,
} from '@n-eye/protocol';
import { createElementId } from '@n-eye/protocol';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const API_KEY_PATTERNS = [
  /sk_live_[0-9a-zA-Z]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[0-9a-zA-Z]{36}/,
  /AIza[0-9A-Za-z-_]{35}/,
  /bearer\s+[a-zA-Z0-9_.-]{20,}/i,
  /CANARY_API_KEY_[a-zA-Z0-9_]+/i,
  /OCR_API_T00[79]_[A-Z0-9_]+/i,
  /VISUAL_API_T010_[A-Z0-9_]+/i,
];
const JWT_REGEX = /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/;

let findingCounter = 0;

function createFindingId(): string {
  findingCounter += 1;
  return `find_${Date.now()}_${findingCounter}`;
}

/**
 * Privacy Detectors (Zone 3 - Local Sensitive Processing)
 * OWNS: Deterministic regex and semantic classification of DOM elements and user task goals.
 * GUARANTEE: Runs strictly locally. Never sends text to external classification APIs.
 */
export function detectElementPrivacy(element: RawElement): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  const textCandidates = [
    { text: element.innerTextCandidate, field: 'element.label' },
    { text: element.ariaLabel, field: 'element.ariaLabel' },
  ].filter((c): c is { text: string; field: string } => Boolean(c.text && c.text.trim().length > 0));

  // 1. Password input type
  if (element.inputType === 'password') {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'SECRET_PASSWORD',
      confidence: 1.0,
      source: 'input_semantics',
      elementId: element.id,
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: 'Interactive element has type=password',
    });
  }

  // 2. Email semantics & text patterns
  if (element.inputType === 'email') {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'PII_EMAIL',
      confidence: 1.0,
      source: 'input_semantics',
      elementId: element.id,
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: 'Interactive element has type=email',
    });
  }

  // 3. Tel semantics
  if (element.inputType === 'tel') {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'PII_PHONE',
      confidence: 1.0,
      source: 'input_semantics',
      elementId: element.id,
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: 'Interactive element has type=tel',
    });
  }

  // 4. Scan text candidates (labels, ARIA, placeholders) for embedded secrets & PII
  for (const { text, field } of textCandidates) {
    const lower = text.toLowerCase();

    // Password hints in labels
    if (lower.includes('password') || lower.includes('passcode') || lower.includes('canary_password')) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'SECRET_PASSWORD',
        confidence: 0.95,
        source: 'context',
        elementId: element.id,
        fieldLocation: field,
        textSpan: text,
        detector: 'label_semantics',
        reason: 'Label or text candidate references password or passcode',
      });
    }

    // OTP hints
    if (lower.includes('otp') || lower.includes('one-time') || lower.includes('2fa') || lower.includes('canary_otp') || lower.includes('verification code')) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'SECRET_OTP',
        confidence: 0.95,
        source: 'context',
        elementId: element.id,
        fieldLocation: field,
        textSpan: text,
        detector: 'label_semantics',
        reason: 'Label or text candidate indicates one-time authentication code',
      });
    }

    // Email regex match
    if (EMAIL_REGEX.test(text)) {
      const match = text.match(EMAIL_REGEX);
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'PII_EMAIL',
        confidence: 0.99,
        source: 'pattern',
        elementId: element.id,
        fieldLocation: field,
        textSpan: match ? match[0] : text,
        detector: 'regex_email',
        reason: 'Found email format in element text candidate',
      });
    }

    // Phone regex match
    if (PHONE_REGEX.test(text) && !text.includes('CANARY_')) {
      const match = text.match(PHONE_REGEX);
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'PII_PHONE',
        confidence: 0.85,
        source: 'pattern',
        elementId: element.id,
        fieldLocation: field,
        textSpan: match ? match[0] : text,
        detector: 'regex_phone',
        reason: 'Found telephone number pattern in element text candidate',
      });
    }

    // API Key patterns
    for (const pattern of API_KEY_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({
          findingId: createFindingId(),
          privacyClass: 'SECRET_API_KEY',
          confidence: 0.99,
          source: 'pattern',
          elementId: element.id,
          fieldLocation: field,
          detector: 'regex_api_key',
          reason: 'Matched high-entropy API key or bearer credential pattern',
        });
        break;
      }
    }

    // JWT pattern
    if (JWT_REGEX.test(text)) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'SECRET_AUTH_TOKEN',
        confidence: 0.99,
        source: 'pattern',
        elementId: element.id,
        fieldLocation: field,
        detector: 'regex_jwt',
        reason: 'Found JWT structure in element text candidate',
      });
    }

    // Session token phrases
    if (
      lower.includes('canary_session') ||
      lower.includes('session_token') ||
      lower.includes('auth_token') ||
      lower.includes('ocr_session')
    ) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'SECRET_SESSION',
        confidence: 0.95,
        source: 'context',
        elementId: element.id,
        fieldLocation: field,
        detector: 'label_semantics',
        reason: 'Found session/auth token reference',
      });
    }
  }

  return findings;
}

/**
 * OCR-derived text uses the SAME privacy taxonomy as DOM text.
 * PRIVACY: Local OCR is not a bypass. source is always 'ocr'.
 */
export function detectOcrTextPrivacy(
  text: string,
  meta: { roiId: string; blockId: string; elementId?: ElementId }
): PrivacyFinding[] {
  if (!text.trim()) return [];
  const synthetic: RawElement = {
    id: meta.elementId || createElementId('ocr_anon'),
    tagName: 'ocr',
    role: null,
    ariaLabel: null,
    innerTextCandidate: text,
    inputType: null,
    isEnabled: true,
    bbox: { x: 0, y: 0, width: 0, height: 0 },
  };
  return detectElementPrivacy(synthetic).map((finding) => ({
    ...finding,
    source: 'ocr',
    elementId: meta.elementId,
    fieldLocation: `ocr.${meta.roiId}.${meta.blockId}`,
    reason: `OCR provenance: ${finding.reason}`,
  }));
}

export function detectGoalPrivacy(goalText: string): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  if (!goalText || !goalText.trim()) return findings;

  // Check email in goal
  const emailMatch = goalText.match(EMAIL_REGEX);
  if (emailMatch) {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'PII_EMAIL',
      confidence: 0.99,
      source: 'pattern',
      fieldLocation: 'task.goal',
      textSpan: emailMatch[0],
      detector: 'regex_email',
      reason: 'User task goal contains raw email address',
    });
  }

  // Check phone in goal
  const phoneMatch = goalText.match(PHONE_REGEX);
  if (phoneMatch && !goalText.includes('CANARY_')) {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'PII_PHONE',
      confidence: 0.85,
      source: 'pattern',
      fieldLocation: 'task.goal',
      textSpan: phoneMatch[0],
      detector: 'regex_phone',
      reason: 'User task goal contains telephone number',
    });
  }

  // Check password in goal
  const passwordMatch = goalText.match(/(?:password|passcode|secret)[:=\s]+([^\s,]+)/i);
  if (passwordMatch && passwordMatch[1]) {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'SECRET_PASSWORD',
      confidence: 0.95,
      source: 'pattern',
      fieldLocation: 'task.goal',
      textSpan: passwordMatch[1],
      detector: 'goal_password_parser',
      reason: 'User task goal specifies an explicit raw password',
    });
  }

  // Check API keys in goal
  for (const pattern of API_KEY_PATTERNS) {
    if (pattern.test(goalText)) {
      const match = goalText.match(pattern);
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'SECRET_API_KEY',
        confidence: 0.99,
        source: 'pattern',
        fieldLocation: 'task.goal',
        textSpan: match ? match[0] : undefined,
        detector: 'regex_api_key',
        reason: 'User task goal contains an API key or bearer secret',
      });
      break;
    }
  }

  return findings;
}
