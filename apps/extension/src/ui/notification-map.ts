/**
 * Popup notification policy.
 * OWNS: Which assurance events become toasts. Observation/site-change do not spam.
 */

import type { AssuranceEvent, AssuranceEventKind } from '@n-eye/protocol';

export type ProductToastKind = 'PROTECTED' | 'APPROVAL' | 'BLOCKED' | 'COMPLETED' | 'DEGRADED';

export interface ProductToast {
  kind: ProductToastKind;
  message: string;
}

const TOAST_KIND: Partial<Record<AssuranceEventKind, ProductToastKind>> = {
  PROTECTED: 'PROTECTED',
  OCR_PROTECTED: 'PROTECTED',
  BLOCKED: 'BLOCKED',
};

export function classifyToast(kind: AssuranceEventKind): ProductToastKind | null {
  return TOAST_KIND[kind] ?? null;
}

export function toastFromEvent(event: AssuranceEvent): ProductToast | null {
  const kind = classifyToast(event.kind);
  if (!kind) return null;
  return { kind, message: event.message };
}

export function toastFromPhase(
  phase: 'COMPLETED' | 'AWAITING_CONFIRMATION' | 'GATEWAY_UNREACHABLE' | 'RATE_LIMITED' | 'DISCONNECTED',
  message: string
): ProductToast {
  if (phase === 'COMPLETED') return { kind: 'COMPLETED', message };
  if (phase === 'AWAITING_CONFIRMATION') return { kind: 'APPROVAL', message };
  return { kind: 'DEGRADED', message };
}
