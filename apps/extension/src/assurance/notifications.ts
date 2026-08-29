import type { AssuranceEvent, AssuranceEventKind } from '@n-eye/protocol';

const DEFAULT_COOLDOWN_MS: Record<AssuranceEventKind, number> = {
  SITE_CHANGE: 20_000,
  PROTECTED: 8_000,
  BLOCKED: 4_000,
  OCR_PROTECTED: 12_000,
  PASSWORD_EXCLUDED: 12_000,
  LOCAL_ONLY: 30_000,
};

/**
 * Notification fatigue control (Zone 2).
 * OWNS: Deduping/cooldowns so SPA mutations and rapid tab switches do not spam.
 * MUST NOT: Include raw secrets, vault values, or URL query parameters in messages.
 */
export class AssuranceBus {
  private lastByKey = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  public emit(
    event: Omit<AssuranceEvent, 'timestamp'> & { timestamp?: number },
    cooldownMs?: number
  ): AssuranceEvent | null {
    const timestamp = event.timestamp ?? this.now();
    const mapped = DEFAULT_COOLDOWN_MS[event.kind];
    const windowMs = cooldownMs ?? mapped ?? 8_000;
    const last = this.lastByKey.get(event.dedupeKey);
    if (last !== undefined && timestamp - last < windowMs) {
      return null;
    }
    this.lastByKey.set(event.dedupeKey, timestamp);
    return { ...event, timestamp };
  }

  public reset(): void {
    this.lastByKey.clear();
  }
}

export function safeHostname(url: string, origin: string, isSupported = true): string {
  if (!isSupported) return 'restricted Chrome page';
  try {
    if (url.startsWith('file:') || origin.startsWith('file:')) return 'local file';
    const host = new URL(origin || url).hostname;
    return host || 'this page';
  } catch {
    return 'this page';
  }
}
