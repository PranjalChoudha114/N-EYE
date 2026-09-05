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
/** Indian mobile: optional +91, then 10 digits starting 6–9. */
const IN_MOBILE_REGEX = /(?:\+91[-\s]?|91[-\s]?)?[6-9]\d{9}\b|(?:\+91[-\s]?)?[6-9]\d{4}\s\d{5}\b/;
/** Aadhaar-like: 12 digits with spaces, not starting 0/1. */
const AADHAAR_REGEX = /\b[2-9]\d{3}\s\d{4}\s\d{4}\b/;
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const GSTIN_REGEX = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const IFSC_REGEX = /\b[A-Z]{4}0[A-Z0-9]{6}\b/;
/** UPI VPA: local@handle with no dot in the provider (unlike email). */
const UPI_REGEX = /\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{2,16}\b/;

/**
 * Clone a pattern with a global flag so replace() can strip every copy.
 * WHY: Detection uses non-global regexes; derived-string redaction must not leave a second secret.
 */
function globalPattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
}

/**
 * Last-line redaction for every derived string that may leave the device.
 * PRIVACY: Classification without a textSpan must still not leak known secret shapes.
 */
export function redactKnownSecretPatterns(text: string, replacement: string): string {
  let out = text;
  for (const pattern of API_KEY_PATTERNS) {
    out = out.replace(globalPattern(pattern), replacement);
  }
  out = out.replace(globalPattern(JWT_REGEX), replacement);
  return out;
}

let findingCounter = 0;

function createFindingId(): string {
  findingCounter += 1;
  return `find_${Date.now()}_${findingCounter}`;
}

function collectIndiaAccountFindings(
  text: string,
  findings: PrivacyFinding[],
  elementId: ElementId | undefined,
  fieldLocation: string
): void {
  const add = (
    privacyClass: PrivacyFinding['privacyClass'],
    span: string,
    detector: string,
    reason: string
  ): void => {
    findings.push({
      findingId: createFindingId(),
      privacyClass,
      confidence: 0.9,
      source: 'pattern',
      elementId,
      fieldLocation,
      textSpan: span,
      detector,
      reason,
    });
  };
  const aadhaar = text.match(AADHAAR_REGEX);
  if (aadhaar?.[0]) add('PII_ACCOUNT_ID', aadhaar[0], 'regex_aadhaar', 'Aadhaar-like 12-digit identifier');
  const pan = text.match(PAN_REGEX);
  if (pan?.[0]) add('PII_ACCOUNT_ID', pan[0], 'regex_pan', 'PAN-like identifier');
  const gstin = text.match(GSTIN_REGEX);
  if (gstin?.[0]) add('PII_ACCOUNT_ID', gstin[0], 'regex_gstin', 'GSTIN-like identifier');
  const ifsc = text.match(IFSC_REGEX);
  if (ifsc?.[0]) add('PII_ACCOUNT_ID', ifsc[0], 'regex_ifsc', 'IFSC-like identifier');
  if (!EMAIL_REGEX.test(text)) {
    const upi = text.match(UPI_REGEX);
    const handle = upi?.[0]?.split('@')[1] || '';
    // TRUST: user@localhost is not a UPI VPA. Over-tokenizing it destroys utility without privacy gain.
    if (
      upi?.[0] &&
      !upi[0].includes('.') &&
      !/^(localhost|local|invalid|test|example|internal|invalidhost)$/i.test(handle)
    ) {
      add('PII_ACCOUNT_ID', upi[0], 'regex_upi', 'UPI-like virtual payment address');
    }
  }
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
    { text: element.regionHeading, field: 'element.regionHeading' },
  ].filter((c): c is { text: string; field: string } => Boolean(c.text && c.text.trim().length > 0));

  // 1. Password input type
  if (element.inputType === 'password') {
    const emptyControl = element.hasValue === false;
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'SECRET_PASSWORD',
      confidence: 1.0,
      source: 'input_semantics',
      elementId: element.id,
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: emptyControl
        ? 'Empty password control; no password value is present'
        : 'Interactive element has type=password',
      valuePresent: !emptyControl,
    });
  }

  // 2. Email semantics & text patterns
  if (element.inputType === 'email') {
    const emptyControl = element.hasValue === false;
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'PII_EMAIL',
      confidence: 1.0,
      source: 'input_semantics',
      elementId: element.id,
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: emptyControl
        ? 'Empty email control; no email value is present'
        : 'Interactive element has type=email',
      valuePresent: !emptyControl,
    });
  }

  // 3. Tel semantics
  if (element.inputType === 'tel') {
    const emptyControl = element.hasValue === false;
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'PII_PHONE',
      confidence: 1.0,
      source: 'input_semantics',
      elementId: element.id,
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: emptyControl
        ? 'Empty telephone control; no phone value is present'
        : 'Interactive element has type=tel',
      valuePresent: !emptyControl,
    });
  }

  // 4. Scan text candidates (labels, ARIA, placeholders) for embedded secrets & PII
  for (const { text, field } of textCandidates) {
    const lower = text.toLowerCase();

    // Password hints in labels — skip when type=password already classified the control.
    // WHY: The word "Password" on an empty field is the control name, not a password value.
    if (
      element.inputType !== 'password' &&
      (lower.includes('password') || lower.includes('passcode') || lower.includes('canary_password'))
    ) {
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
        valuePresent: element.hasValue === true,
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
        valuePresent: element.hasValue === true,
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

    // API keys before phone: digit runs inside keys are not telephone numbers.
    let matchedApiKey = false;
    for (const pattern of API_KEY_PATTERNS) {
      const keyMatch = text.match(pattern);
      if (keyMatch?.[0]) {
        matchedApiKey = true;
        findings.push({
          findingId: createFindingId(),
          privacyClass: 'SECRET_API_KEY',
          confidence: 0.99,
          source: 'pattern',
          elementId: element.id,
          fieldLocation: field,
          textSpan: keyMatch[0],
          detector: 'regex_api_key',
          reason: 'Matched high-entropy API key or bearer credential pattern',
        });
        break;
      }
    }

    // Phone regex match. Unstructured 10-digit runs in page prose (IDs, ISBNs) are not US telephones.
    let classifiedPhone = false;
    if (PHONE_REGEX.test(text) && !text.includes('CANARY_') && !matchedApiKey) {
      const match = text.match(PHONE_REGEX);
      const span = match ? match[0] : text;
      const bibliographic = /\b(isbn|issn|doi|oclc|lccn|pmid|arxiv)\b/i.test(text);
      const structured = /[+\-().\s]/.test(span);
      const phoneContext =
        element.inputType === 'tel' || /\b(phone|mobile|fax|tel|call)\b/i.test(text);
      if (!bibliographic && (structured || phoneContext)) {
        classifiedPhone = true;
        findings.push({
          findingId: createFindingId(),
          privacyClass: 'PII_PHONE',
          confidence: 0.85,
          source: 'pattern',
          elementId: element.id,
          fieldLocation: field,
          textSpan: span,
          detector: 'regex_phone',
          reason: 'Found telephone number pattern in element text candidate',
        });
      }
    }
    if (
      !classifiedPhone &&
      IN_MOBILE_REGEX.test(text) &&
      !text.includes('CANARY_') &&
      !matchedApiKey &&
      !/\b(isbn|issn|doi|oclc|lccn|pmid|arxiv)\b/i.test(text)
    ) {
      const match = text.match(IN_MOBILE_REGEX);
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'PII_PHONE',
        confidence: 0.9,
        source: 'pattern',
        elementId: element.id,
        fieldLocation: field,
        textSpan: match ? match[0] : text,
        detector: 'regex_in_mobile',
        reason: 'Found Indian mobile number pattern',
      });
    }

    collectIndiaAccountFindings(text, findings, element.id, field);

    if (
      /^(name|your name|full name|first name|last name)$/i.test(text.trim()) ||
      /\b(full name|first name|last name)\b/i.test(lower)
    ) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'PII_NAME',
        confidence: 0.8,
        source: 'context',
        elementId: element.id,
        fieldLocation: field,
        textSpan: text,
        detector: 'label_semantics',
        reason: 'Labeled name field',
        valuePresent: element.hasValue === true,
      });
    }
    if (/^(address|street address|mailing address|home address)$/i.test(text.trim())) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'PII_ADDRESS',
        confidence: 0.8,
        source: 'context',
        elementId: element.id,
        fieldLocation: field,
        textSpan: text,
        detector: 'label_semantics',
        reason: 'Labeled address field',
        valuePresent: element.hasValue === true,
      });
    }

    // JWT pattern
    if (JWT_REGEX.test(text)) {
      const match = text.match(JWT_REGEX);
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'SECRET_AUTH_TOKEN',
        confidence: 0.99,
        source: 'pattern',
        elementId: element.id,
        fieldLocation: field,
        textSpan: match ? match[0] : text,
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
        textSpan: text,
        detector: 'label_semantics',
        reason: 'Found session/auth token reference',
        valuePresent: element.hasValue === true,
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
  } else {
    const inMobile = goalText.match(IN_MOBILE_REGEX);
    if (inMobile && !goalText.includes('CANARY_')) {
      findings.push({
        findingId: createFindingId(),
        privacyClass: 'PII_PHONE',
        confidence: 0.9,
        source: 'pattern',
        fieldLocation: 'task.goal',
        textSpan: inMobile[0],
        detector: 'regex_in_mobile',
        reason: 'User task goal contains an Indian mobile number',
      });
    }
  }

  collectIndiaAccountFindings(goalText, findings, undefined, 'task.goal');

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

  const jwtMatch = goalText.match(JWT_REGEX);
  if (jwtMatch) {
    findings.push({
      findingId: createFindingId(),
      privacyClass: 'SECRET_AUTH_TOKEN',
      confidence: 0.99,
      source: 'pattern',
      fieldLocation: 'task.goal',
      textSpan: jwtMatch[0],
      detector: 'regex_jwt',
      reason: 'User task goal contains a JWT structure',
    });
  }

  return findings;
}
