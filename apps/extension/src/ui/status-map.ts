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
        message: detail || 'Looking at this page on your device. No AI request has been sent.',
        tone: 'ok',
      };
    case 'OBSERVING':
      return { headline: 'Looking at this page', message: detail || 'Reading this page on your device.', tone: 'info' };
    case 'RECOVERING':
      return {
        headline: 'Reconnecting',
        message: detail || 'Reconnecting to this page.',
        tone: 'warning',
      };
    case 'UNSUPPORTED':
      return { headline: 'Unsupported page', message: detail || 'This page cannot be observed.', tone: 'warning' };
    case 'DISCONNECTED':
      return {
        headline: 'Disconnected',
        message: detail || 'N-Eye is not connected to this page.',
        tone: 'warning',
      };
    case 'PERCEIVING':
      return {
        headline: 'Understanding what matters',
        message: detail || 'Reading visible text on this device.',
        tone: 'info',
      };
    case 'PROTECTING':
      return {
        headline: 'Protecting your information',
        message: detail || 'Personal information is being handled on this device.',
        tone: 'info',
      };
    case 'PLANNING':
      return {
        headline: 'Asking AI for the next step',
        message: detail || 'Only protected page information is being sent to the AI.',
        tone: 'info',
      };
    case 'VALIDATING':
      return {
        headline: 'Checking the proposed action',
        message: detail || 'Checking the proposed action against this page.',
        tone: 'info',
      };
    case 'AWAITING_CONFIRMATION':
      return {
        headline: 'N-Eye needs your approval',
        message: detail || 'This action needs your approval before N-Eye will do it.',
        tone: 'warning',
      };
    case 'ACTING':
      return { headline: 'Doing the action', message: detail || 'Carrying out a locally checked action.', tone: 'info' };
    case 'VERIFYING':
      return {
        headline: 'Making sure it worked',
        message: detail || 'Checking that the page actually changed.',
        tone: 'info',
      };
    case 'PROTECTED':
      return {
        headline: 'AI request protected',
        message: detail || 'N-Eye protected your information before asking AI for help.',
        tone: 'ok',
      };
    case 'COMPLETED':
      return { headline: 'Completed', message: detail || 'The task finished.', tone: 'ok' };
    case 'BLOCKED':
      return { headline: 'Action blocked', message: detail || 'N-Eye refused this action.', tone: 'danger' };
    case 'CANCELLED':
      return { headline: 'Cancelled', message: detail || 'The task was stopped.', tone: 'neutral' };
    case 'RATE_LIMITED':
      return {
        headline: 'AI service is temporarily busy',
        message: detail || 'The AI service rejected this request. Try again in a moment.',
        tone: 'warning',
      };
    case 'GATEWAY_UNREACHABLE':
      return {
        headline: "Can't connect to the AI service",
        message: detail || 'The local AI gateway did not respond. This is not a claim about a specific cloud model.',
        tone: 'warning',
      };
    case 'PROVIDER_UNAVAILABLE':
      return {
        headline: 'AI service is unavailable',
        message: detail || 'The AI service is unavailable or misconfigured. The local gateway may still be reachable.',
        tone: 'warning',
      };
    case 'RETRYING':
      return {
        headline: 'Trying again',
        message: detail || 'Retrying the same protected request. Privacy rules have not been relaxed.',
        tone: 'info',
      };
    case 'OCR_UNAVAILABLE':
      return {
        headline: 'Could not read visible text',
        message: detail || 'Visible text could not be read on this device. The screenshot stayed here.',
        tone: 'warning',
      };
    case 'ASK_USER':
      return {
        headline: 'I need your help',
        message:
          detail ||
          'I cannot safely decide the next step. Rewrite your request below, then continue. This is not an approval.',
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
