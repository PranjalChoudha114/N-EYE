import { describe, expect, it } from 'vitest';
import { classifyPlannerFailure, statusCopy } from '../ui/status-map.js';

describe('status mapping', () => {
  it('maps phases to truthful human copy', () => {
    expect(statusCopy('READY').message).toMatch(/No N-Eye AI request occurred/);
    expect(statusCopy('PROTECTED').headline).toMatch(/protected/i);
    expect(statusCopy('AWAITING_CONFIRMATION').tone).toBe('warning');
    expect(statusCopy('BLOCKED').tone).toBe('danger');
  });

  it('classifies planner failures without claiming Gemini is online', () => {
    expect(classifyPlannerFailure('Planner rate limit exceeded. Please wait a moment.')).toBe('RATE_LIMITED');
    expect(classifyPlannerFailure('Failed to reach planner gateway at http://localhost:8000')).toBe(
      'GATEWAY_UNREACHABLE'
    );
    expect(classifyPlannerFailure('Action execution failed')).toBe('ERROR');
  });
});
