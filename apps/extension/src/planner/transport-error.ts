import { NEyeError, type PlannerTransportCode } from '@n-eye/protocol';

/**
 * Planner transport failure (Zone 4).
 *
 * OWNS: Classified, sanitized planner/gateway errors.
 * TRUST: Messages are safe to show. They must never include vault values, raw
 *        SafeContext, provider request bodies, or raw page strings.
 */
export class PlannerTransportError extends NEyeError {
  public readonly code: PlannerTransportCode;
  public readonly retryable: boolean;
  public readonly httpStatus?: number;
  public readonly retryAfterMs?: number;
  public readonly attempt: number;

  constructor(args: {
    code: PlannerTransportCode;
    message: string;
    retryable: boolean;
    httpStatus?: number;
    retryAfterMs?: number;
    attempt?: number;
  }) {
    const category = args.code === 'NETWORK_FAILURE' || args.code === 'TIMEOUT' ? 'NETWORK_ERROR' : 'PLANNER_ERROR';
    super(category, args.message, args.retryable);
    this.name = 'PlannerTransportError';
    this.code = args.code;
    this.retryable = args.retryable;
    this.httpStatus = args.httpStatus;
    this.retryAfterMs = args.retryAfterMs;
    this.attempt = args.attempt ?? 1;
  }
}

export const PLANNER_MAX_ATTEMPTS = 3;
export const PLANNER_RETRY_BASE_MS = 500;
export const PLANNER_RETRY_MAX_DELAY_MS = 5_000;
export const PLANNER_429_DEFAULT_DELAY_MS = 1_000;
export const PLANNER_429_MAX_EXTRA_ATTEMPTS = 1;

export function parseRetryAfterMs(header: string | null | undefined, fallbackMs: number, capMs: number): number {
  if (!header) return fallbackMs;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, capMs);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), capMs);
  }
  return fallbackMs;
}

export function retryBackoffMs(failedAttempt: number): number {
  const exp = Math.max(0, failedAttempt - 1);
  return Math.min(PLANNER_RETRY_BASE_MS * 2 ** exp, PLANNER_RETRY_MAX_DELAY_MS);
}
