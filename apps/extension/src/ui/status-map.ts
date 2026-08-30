/**
 * Product status copy.
 * OWNS: phase → human headline/message. Never invents provider or privacy claims.
 */

import type { ProductPhase, StatusTone } from '../runtime/ui-snapshot.js';
import { PlannerTransportError } from '../planner/transport-error.js';

export interface StatusCopy {
  headline: string;
  message: string;
  tone: StatusTone;
}

export function statusCopy(phase: ProductPhase, detail?: string): StatusCopy {
  switch (phase) {
    case 'IDLE':
      return { headline: 'Ready', message: detail || 'N-Eye is idle.', tone: 'neutral' };
    case 'READY':
      return {
        headline: 'Ready',
        message: detail || 'Page observed locally. No N-Eye AI request occurred.',
        tone: 'ok',
      };
    case 'OBSERVING':
      return { headline: 'Observing locally', message: detail || 'Reading this page on your device.', tone: 'info' };
    case 'RECOVERING':
      return {
        headline: 'Recovering',
        message: detail || 'Reconnecting the local content script.',
        tone: 'warning',
      };
    case 'UNSUPPORTED':
      return { headline: 'Unsupported page', message: detail || 'This page cannot be observed.', tone: 'warning' };
    case 'DISCONNECTED':
      return {
        headline: 'Disconnected',
        message: detail || 'Content script is not running on this page.',
        tone: 'warning',
      };
    case 'PERCEIVING':
      return { headline: 'Perceiving locally', message: detail || 'Reading visual text on-device.', tone: 'info' };
    case 'PROTECTING':
      return { headline: 'Protecting', message: detail || 'Sensitive values are being handled locally.', tone: 'info' };
    case 'PLANNING':
      return {
        headline: 'Planning',
        message: detail || 'Only protected context is being sent to the configured planner.',
        tone: 'info',
      };
    case 'VALIDATING':
      return { headline: 'Validating', message: detail || 'Checking the proposal against this page.', tone: 'info' };
    case 'AWAITING_CONFIRMATION':
      return {
        headline: 'Approval required',
        message: detail || 'N-Eye needs your confirmation before a high-risk action.',
        tone: 'warning',
      };
    case 'ACTING':
      return { headline: 'Acting', message: detail || 'Executing a locally validated action.', tone: 'info' };
    case 'VERIFYING':
      return { headline: 'Verifying', message: detail || 'Checking that the page actually changed.', tone: 'info' };
    case 'PROTECTED':
      return { headline: 'AI request protected', message: detail || 'A protected planner request completed.', tone: 'ok' };
    case 'COMPLETED':
      return { headline: 'Completed', message: detail || 'The task finished.', tone: 'ok' };
    case 'BLOCKED':
      return { headline: 'Action blocked', message: detail || 'N-Eye refused this action.', tone: 'danger' };
    case 'CANCELLED':
      return { headline: 'Cancelled', message: detail || 'The task was stopped.', tone: 'neutral' };
    case 'RATE_LIMITED':
      return {
        headline: 'Planner rate limited',
        message: detail || 'The planner provider rejected this request. Try again in a moment.',
        tone: 'warning',
      };
    case 'GATEWAY_UNREACHABLE':
      return {
        headline: 'Gateway unreachable',
        message: detail || 'The local planner gateway did not respond. This is not a Gemini health claim.',
        tone: 'warning',
      };
    case 'PROVIDER_UNAVAILABLE':
      return {
        headline: 'Planner provider unavailable',
        message: detail || 'The planner provider is unavailable or misconfigured. The gateway may still be reachable.',
        tone: 'warning',
      };
    case 'RETRYING':
      return {
        headline: 'Retrying planner',
        message: detail || 'Retrying a bounded planner request with the same protected context.',
        tone: 'info',
      };
    case 'OCR_UNAVAILABLE':
      return {
        headline: 'On-device perception unavailable',
        message: detail || 'Visual text could not be read locally. The screenshot stayed on this device.',
        tone: 'warning',
      };
    case 'ASK_USER':
      return {
        headline: 'Need your input',
        message: detail || 'N-Eye needs the next instruction. This is not a high-risk confirmation.',
        tone: 'warning',
      };
    case 'ERROR':
      return { headline: 'Error', message: detail || 'The task failed.', tone: 'danger' };
    default:
      return { headline: 'Ready', message: detail || 'N-Eye is idle.', tone: 'neutral' };
  }
}

export function classifyPlannerFailure(error: unknown): ProductPhase {
  if (error instanceof PlannerTransportError) {
    switch (error.code) {
      case 'RATE_LIMITED':
        return 'RATE_LIMITED';
      case 'NETWORK_FAILURE':
        return 'GATEWAY_UNREACHABLE';
      case 'MISCONFIGURED':
      case 'UNAVAILABLE':
      case 'TIMEOUT':
      case 'AUTH_FAILED':
        return 'PROVIDER_UNAVAILABLE';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return 'ERROR';
    }
  }
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (text.includes('rate limit') || text.includes('rate limited')) return 'RATE_LIMITED';
  if (text.includes('failed to reach planner gateway') || text.includes('gateway unreachable')) {
    return 'GATEWAY_UNREACHABLE';
  }
  if (text.includes('misconfigured') || text.includes('provider unavailable') || text.includes('timed out')) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return 'ERROR';
}
