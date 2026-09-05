/**
 * Shared human-facing labels for compact UI.
 * OWNS: Byte formatting and screenshot/AI-connection phrasing.
 * MUST NEVER: Claim "everything is safe" or that website-bound data stayed only on this device.
 */

const COMPACT_FORBIDDEN = [
  'SafeContext',
  'tokenization',
  'PageEpoch',
  'EgressGuard',
  'Egress Guard',
  're-ground',
  'ActionProposal',
];

export function formatPayloadBytes(bytes: number): string {
  if (bytes < 0) return 'unknown';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(1)} KB`;
  return `${Math.round(kb)} KB`;
}

export function screenshotOutboundLabel(bytes: number): string {
  if (bytes < 0) return 'Screenshot status unknown';
  if (bytes === 0) return 'No screenshot was sent';
  return `Screenshot sent: ${formatPayloadBytes(bytes)}`;
}

export function screenshotOutboundHint(bytes: number): string {
  if (bytes === 0) return 'N-Eye understood this task without sending a screenshot to the AI.';
  return 'A screenshot payload was recorded for this request.';
}

export function protectedContextLabel(bytes: number): string {
  return `Protected AI context: ${formatPayloadBytes(bytes)}`;
}

export function protectedContextHint(bytes: number): string {
  return `Technical: SafeContext serialized bytes: ${bytes}`;
}

export function isPlaceholderLabel(text: string | undefined | null): boolean {
  const t = (text || '').trim();
  return t.length === 0 || t === '—' || t === '-' || t === '–' || t === 'unknown';
}

export function compactContainsForbiddenJargon(text: string): boolean {
  return COMPACT_FORBIDDEN.some((term) => text.includes(term));
}

export const SCREENSHOT_HINT = 'N-Eye understood this task without sending a screenshot to the AI.';
export const HIDDEN_FROM_AI_HINT =
  'N-Eye replaced this information with a private reference before AI reasoning.';
export const STAYED_ON_DEVICE_HINT =
  'This value was kept in local N-Eye memory for this request. It was not sent to the AI. The website may still see what you type on the page.';
export const AI_CONNECTION_HINT = 'Shows which planning mode handled this request.';
export const RECHECKED_PAGE_HINT = 'N-Eye rechecked the control before acting because webpages can change.';

/**
 * Engine exceptions are not product language.
 * WHY: Missing targets and incomplete action views must never surface as TypeError text.
 */
export function isEngineExceptionText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('cannot read propert') ||
    lower.includes('is not a function') ||
    lower.includes('undefined is not') ||
    lower.includes('targetcurrent') ||
    /\bpageepoch mismatch\b/i.test(text) ||
    /selector resolution failure/i.test(text)
  );
}

export function humanizeUnsafeError(detail: string, fallback: string): string {
  if (!detail.trim()) return fallback;
  if (isEngineExceptionText(detail)) return fallback;
  return detail;
}

export const MISSING_TARGET_HUMAN =
  "I couldn't find one safe, unique control that matches your request, so I stopped without clicking anything.";
export const ENGINE_FAILURE_HUMAN =
  'Something went wrong while checking this page. N-Eye stopped without changing anything.';
