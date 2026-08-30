import { describe, expect, it } from 'vitest';
import { classifyPlannerFailure, statusCopy } from '../ui/status-map.js';

describe('status mapping', () => {
  it('maps phases to truthful human copy', () => {
    expect(statusCopy('READY').message).toMatch(/No N-Eye AI request occurred/);
    expect(statusCopy('PROTECTED').headline).toMatch(/protected/i);
    expect(statusCopy('AWAITING_CONFIRMATION').tone).toBe('warning');
    expect(statusCopy('BLOCKED').tone).toBe('danger');
    expect(statusCopy('PROVIDER_UNAVAILABLE').tone).toBe('warning');
    expect(statusCopy('ASK_USER').headline).toMatch(/Need your input/i);
    expect(statusCopy('OCR_UNAVAILABLE').message).toMatch(/screenshot stayed/i);
    expect(statusCopy('COMPLETED', 'Goal already satisfied. No action was required.').message).toMatch(
      /already satisfied/i
    );
    expect(statusCopy('COMPLETED', 'Goal already satisfied. No action was required.').headline).toBe('Completed');
  });

  it('classifies planner failures without claiming Gemini is online', () => {
    expect(classifyPlannerFailure('Planner rate limit exceeded. Please wait a moment.')).toBe('RATE_LIMITED');
    expect(classifyPlannerFailure('Failed to reach planner gateway at http://localhost:8000')).toBe(
      'GATEWAY_UNREACHABLE'
    );
    expect(classifyPlannerFailure('Planner provider endpoint or model is misconfigured.')).toBe(
      'PROVIDER_UNAVAILABLE'
    );
    expect(classifyPlannerFailure('Action execution failed')).toBe('ERROR');
  });
});
