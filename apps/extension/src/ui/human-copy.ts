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

export function aiConnectionLabel(provider: string, model?: string): string {
  if (!provider || provider === '—' || provider === 'Not recorded') return 'Not recorded';
  return model ? `${provider} · ${model}` : provider;
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
