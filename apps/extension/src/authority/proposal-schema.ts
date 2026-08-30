import {
  type ActionProposal,
  type ActionType,
  type RiskLevel,
  type SecurityReasonCode,
} from '@n-eye/protocol';

/**
 * Proposal shape gate (Zone 3 — first local check on untrusted planner output).
 *
 * OWNS: Deciding whether a planner response is even shaped like an ActionProposal.
 * WHY: A schema-close response must not smuggle authority. `{"confirmed": true}`,
 *      `{"selector": "#danger"}`, or `{"policyOverride": "..."}` are silently ignored by
 *      field-by-field readers, which makes them invisible rather than rejected.
 * TRUST BOUNDARY: Everything reaching this function is untrusted advice.
 * WHAT MAY CROSS: Exactly the known ActionProposal keys with well-formed values.
 * WHAT MUST NEVER CROSS: Unknown keys, selectors, script payloads, self-granted confirmation
 *                        or verification claims, and non-opaque target identifiers.
 */
export class MalformedProposalError extends Error {
  public readonly reasonCode: SecurityReasonCode;

  constructor(message: string, reasonCode: SecurityReasonCode = 'MALFORMED_PROPOSAL') {
    super(message);
    this.name = 'MalformedProposalError';
    this.reasonCode = reasonCode;
  }
}

const ALLOWED_KEYS = new Set<string>([
  'actionId',
  'type',
  'targetId',
  'tokenId',
  'tokenSymbol',
  'textValue',
  'scrollDelta',
  'reasoning',
  'expectedOutcome',
  'riskLevel',
]);

const ALLOWED_TYPES = new Set<ActionType>([
  'CLICK',
  'TYPE_TOKEN',
  'TYPE_TEXT',
  'SCROLL',
  'SELECT',
  'WAIT',
  'ASK_USER',
  'COMPLETE',
]);

const ALLOWED_RISK = new Set<RiskLevel>(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']);

/**
 * Keys a hostile or manipulated planner is most likely to invent when it tries to
 * self-grant authority. Named explicitly so the block reason is explainable, not generic.
 */
const AUTHORITY_CLAIM_KEYS = new Set<string>([
  'confirmed',
  'userConfirmed',
  'confirmation',
  'approved',
  'verified',
  'verification',
  'policyOverride',
  'override',
  'privacyOverride',
  'riskOverride',
  'trusted',
  'selector',
  'cssSelector',
  'xpath',
  'javascript',
  'script',
  'eval',
  'code',
  'command',
  'url',
  'href',
  'epoch',
  'pageEpoch',
  'frameId',
  'origin',
  'systemPrompt',
]);

/** Opaque element identity: `e12` in the top document, `f1e12` inside a same-origin frame. */
const OPAQUE_ELEMENT_ID = /^(?:f\d{1,3})?e\d{1,6}$/;
const OPAQUE_TOKEN_ID = /^tok_[A-Za-z0-9_-]{1,40}$/;
const TOKEN_SYMBOL = /^\[[A-Z][A-Z0-9_]{0,30}\]$/;
const ACTION_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const EXECUTABLE_TEXT = /(?:javascript:|data:text\/html|<\s*script|on(?:error|load|click)\s*=)/i;

const MAX_REASONING_LENGTH = 2000;
const MAX_TEXT_VALUE_LENGTH = 500;
export const MAX_SCROLL_ABS_PX = 2000;

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new MalformedProposalError(`Proposal field ${field} must be a string.`);
  }
  if (value.length > max) {
    throw new MalformedProposalError(`Proposal field ${field} exceeds ${max} characters.`);
  }
  return value;
}

/**
 * Narrows untrusted input to an ActionProposal or throws. Fail-closed: anything unrecognized
 * is a rejection, never a silently dropped field.
 */
export function assertProposalShape(raw: unknown): ActionProposal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MalformedProposalError('Proposal is not a JSON object.');
  }

  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (ALLOWED_KEYS.has(key)) continue;
    // An invented authority field is a policy violation, not a typo.
    if (AUTHORITY_CLAIM_KEYS.has(key)) {
      throw new MalformedProposalError(
        `Proposal attempted to claim authority through unsupported field "${key}". Rejected.`,
        'UNTRUSTED_AUTHORITY_CLAIM'
      );
    }
    throw new MalformedProposalError(`Proposal contains unsupported field "${key}". Rejected.`);
  }

  const actionId = requireString(record['actionId'], 'actionId', 80);
  if (!ACTION_ID.test(actionId)) {
    throw new MalformedProposalError('Proposal actionId has an unsupported format.');
  }

  const type = record['type'];
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type as ActionType)) {
    throw new MalformedProposalError(`Proposal type "${String(type)}" is not in the action vocabulary.`);
  }

  const riskLevel = record['riskLevel'] ?? 'LOW';
  if (typeof riskLevel !== 'string' || !ALLOWED_RISK.has(riskLevel as RiskLevel)) {
    throw new MalformedProposalError(`Proposal riskLevel "${String(riskLevel)}" is not a known risk level.`);
  }

  const proposal: Record<string, unknown> = {
    actionId,
    type,
    riskLevel,
    reasoning: record['reasoning'] === undefined ? '' : requireString(record['reasoning'], 'reasoning', MAX_REASONING_LENGTH),
    expectedOutcome:
      record['expectedOutcome'] === undefined
        ? ''
        : requireString(record['expectedOutcome'], 'expectedOutcome', MAX_REASONING_LENGTH),
  };

  if (record['targetId'] !== undefined && record['targetId'] !== null) {
    const targetId = requireString(record['targetId'], 'targetId', 32);
    // Only opaque local IDs. Selectors, XPath, and URLs have no representation here.
    if (!OPAQUE_ELEMENT_ID.test(targetId)) {
      throw new MalformedProposalError(
        `Proposal targetId "${targetId}" is not an opaque local element identifier. Selectors are not executable.`,
        'INVALID_TARGET'
      );
    }
    proposal['targetId'] = targetId;
  }

  if (record['tokenId'] !== undefined && record['tokenId'] !== null) {
    const tokenId = requireString(record['tokenId'], 'tokenId', 48);
    if (!OPAQUE_TOKEN_ID.test(tokenId)) {
      throw new MalformedProposalError(`Proposal tokenId "${tokenId}" has an unsupported format.`, 'TOKEN_SCOPE_VIOLATION');
    }
    proposal['tokenId'] = tokenId;
  }

  if (record['tokenSymbol'] !== undefined && record['tokenSymbol'] !== null) {
    const tokenSymbol = requireString(record['tokenSymbol'], 'tokenSymbol', 40);
    if (!TOKEN_SYMBOL.test(tokenSymbol)) {
      throw new MalformedProposalError(
        `Proposal tokenSymbol "${tokenSymbol}" has an unsupported format.`,
        'TOKEN_SCOPE_VIOLATION'
      );
    }
    proposal['tokenSymbol'] = tokenSymbol;
  }

  if (record['textValue'] !== undefined && record['textValue'] !== null) {
    const textValue = requireString(record['textValue'], 'textValue', MAX_TEXT_VALUE_LENGTH);
    // TYPE_TEXT writes into a field; it must never carry a script or navigation payload.
    if (EXECUTABLE_TEXT.test(textValue)) {
      throw new MalformedProposalError(
        'Proposal textValue contains an executable or navigation payload. Rejected.',
        'POLICY_VIOLATION'
      );
    }
    proposal['textValue'] = textValue;
  }

  if (record['scrollDelta'] !== undefined && record['scrollDelta'] !== null) {
    const delta = record['scrollDelta'];
    if (typeof delta !== 'object' || Array.isArray(delta)) {
      throw new MalformedProposalError('Proposal scrollDelta must be an object.');
    }
    const { x, y, ...rest } = delta as { x?: unknown; y?: unknown };
    if (Object.keys(rest).length > 0) {
      throw new MalformedProposalError('Proposal scrollDelta contains unsupported fields.');
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new MalformedProposalError('Proposal scrollDelta requires finite x and y.');
    }
    if (Math.abs(Number(x)) > MAX_SCROLL_ABS_PX || Math.abs(Number(y)) > MAX_SCROLL_ABS_PX) {
      throw new MalformedProposalError(
        `Proposal scrollDelta exceeds the ${MAX_SCROLL_ABS_PX}px bound.`,
        'POLICY_VIOLATION'
      );
    }
    proposal['scrollDelta'] = { x: Number(x), y: Number(y) };
  }

  return proposal as unknown as ActionProposal;
}
