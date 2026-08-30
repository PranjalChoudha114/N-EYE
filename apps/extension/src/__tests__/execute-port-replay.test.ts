import { describe, expect, it } from 'vitest';
import { toPortResult } from '../runtime/page-ports.js';
import { shouldStopAfterUnverifiedHighRisk } from '../verification/idempotency.js';
import type { ExecutionResult } from '../execution/executor.js';

describe('Execute port + high-risk replay policy', () => {
  it('preserves ASK_USER evidence when the content script reports action failure', () => {
    const data: ExecutionResult = {
      success: false,
      error: 'Custom select widgets are not executed.',
      outcome: 'ASK_USER',
      selectMatched: false,
    };
    const port = toPortResult(undefined, { success: false, error: data.error, data });
    expect(port.ok).toBe(true);
    if (port.ok) {
      expect(port.data.outcome).toBe('ASK_USER');
      expect(port.data.success).toBe(false);
    }
  });

  it('does not treat chrome.runtime.lastError as an action result', () => {
    const port = toPortResult('Could not establish connection', {
      success: true,
      data: { success: true },
    });
    expect(port.ok).toBe(false);
  });

  it('stops automatic continuation after unverified HIGH actions', () => {
    expect(shouldStopAfterUnverifiedHighRisk('HIGH', 'AMBIGUOUS')).toBe(true);
    expect(shouldStopAfterUnverifiedHighRisk('HIGH', 'VERIFIED_FAILURE')).toBe(true);
    expect(shouldStopAfterUnverifiedHighRisk('HIGH', 'VERIFIED_SUCCESS')).toBe(false);
    expect(shouldStopAfterUnverifiedHighRisk('MEDIUM', 'AMBIGUOUS')).toBe(false);
  });
});
