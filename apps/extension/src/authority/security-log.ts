import type { SecurityReasonCode } from '@n-eye/protocol';

/**
 * Security diagnostics (Zone 3).
 *
 * OWNS: An in-memory ring of reason-coded security decisions for Evidence Mode.
 * WHY: A block is only trustworthy if the user can see why it happened.
 * PRIVACY: Entries carry a reason code, an action type, and an opaque element/frame id.
 * MUST NEVER: Carry vault realValue, passwords, OTPs, API keys, raw page text, raw OCR text,
 *             full URLs with query strings, or the attacker's injected instruction payload.
 */
export interface SecurityEvent {
  reasonCode: SecurityReasonCode;
  /** Short, operator-facing detail. Must name a field or policy, never a secret value. */
  detail: string;
  actionType?: string;
  targetId?: string;
  timestamp: number;
}

const MAX_EVENTS = 32;

/** Anything that looks like a secret or an address must not survive into diagnostics. */
const SCRUB_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /CANARY_[A-Z0-9_]+/gi,
  /sk_live_[0-9a-zA-Z]{8,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /ghp_[0-9a-zA-Z]{36}/g,
  /AIza[0-9A-Za-z-_]{35}/g,
  /bearer\s+[a-zA-Z0-9_.-]{20,}/gi,
  /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
  /\b\d{6,}\b/g,
];

const MAX_DETAIL_LENGTH = 200;

export function scrubSecurityDetail(detail: string): string {
  let safe = detail;
  for (const pattern of SCRUB_PATTERNS) {
    safe = safe.replace(pattern, '[REDACTED]');
  }
  return safe.replace(/\s{2,}/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH);
}

export class SecurityLog {
  private events: SecurityEvent[] = [];

  public record(event: Omit<SecurityEvent, 'timestamp'>): SecurityEvent {
    const entry: SecurityEvent = {
      reasonCode: event.reasonCode,
      detail: scrubSecurityDetail(event.detail),
      timestamp: Date.now(),
    };
    if (event.actionType) entry.actionType = event.actionType;
    if (event.targetId) entry.targetId = event.targetId;
    this.events.push(entry);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
    return entry;
  }

  public list(): readonly SecurityEvent[] {
    return this.events;
  }

  public latest(): SecurityEvent | undefined {
    return this.events[this.events.length - 1];
  }

  public clear(): void {
    this.events = [];
  }
}
