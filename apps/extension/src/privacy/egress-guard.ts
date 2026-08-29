import type { SafeContext } from '@n-eye/protocol';

export class EgressViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EgressViolationError';
  }
}

const FORBIDDEN_CANARY_PATTERNS = [
  /CANARY_[A-Z0-9_]+/i,
  /OCR_(API|OTP|SESSION|PASSWORD|EMAIL|PHONE)_T007/i,
  /sk_live_[0-9a-zA-Z]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /data:image\//i,
  /iVBORw0KGgo/,
];

const MAX_SAFE_CONTEXT_BYTES = 256 * 1024; // 256 KB bound

/**
 * EgressGuard (Zone 4 - Network Boundary)
 * OWNS: Final local security checkpoint before any planner request candidate is serialized.
 * TRUST BOUNDARY: Enforces strict allowlist schema validation and byte-level scanning for forbidden canary secrets.
 * MUST NOT: Permit raw DOM scenes, unsanitized goals, or plain passwords to reach transport.
 */
export function validateSafeContextEgress(context: SafeContext): string {
  if (!context) {
    throw new EgressViolationError('Egress payload cannot be null or undefined.');
  }

  if (context.protocolVersion !== '1.0.0') {
    throw new EgressViolationError(`Unsupported protocol version: ${context.protocolVersion}`);
  }

  if (!context.taskId || typeof context.taskId !== 'string') {
    throw new EgressViolationError('SafeContext must contain a valid taskId.');
  }

  if (!context.pageEpoch || typeof context.pageEpoch !== 'number') {
    throw new EgressViolationError('SafeContext must contain a valid pageEpoch.');
  }

  // Schema sanity check - forbid local-only properties
  const rawObj = context as unknown as Record<string, unknown>;
  if ('_isLocalOnly' in rawObj || 'elements' in rawObj || 'privacyFindings' in rawObj || 'ocrBlocks' in rawObj) {
    throw new EgressViolationError(
      'RawScene leakage detected in SafeContext. Local-only properties must never cross the network boundary.'
    );
  }

  // Serialize payload to actual bytes
  const serialized = JSON.stringify(context);

  if (serialized.length > MAX_SAFE_CONTEXT_BYTES) {
    throw new EgressViolationError(
      `SafeContext payload size (${serialized.length} bytes) exceeds safety limit of ${MAX_SAFE_CONTEXT_BYTES} bytes.`
    );
  }

  // Byte-level canary scan
  for (const pattern of FORBIDDEN_CANARY_PATTERNS) {
    if (pattern.test(serialized)) {
      const match = serialized.match(pattern);
      throw new EgressViolationError(
        `Egress blocked: forbidden canary credential or raw secret detected in serialized payload (${match?.[0] || 'pattern'}).`
      );
    }
  }

  return serialized;
}
