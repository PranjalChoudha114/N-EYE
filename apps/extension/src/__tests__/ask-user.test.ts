import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildAskUserView, classifyAskUser, isAskUserApprovalCopy } from '../ui/ask-user.js';
import { compactContainsForbiddenJargon, formatPayloadBytes, screenshotOutboundLabel } from '../ui/human-copy.js';
import { statusCopy } from '../ui/status-map.js';
import { pipelineRailLabel, pipelineStageHelp } from '../ui/pipeline-copy.js';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { applyOverlayState, mountOverlay, unmountOverlay } from '../overlay/overlay-host.js';

describe('ASK_USER clarification', () => {
  it('classifies unknown Mock grammar as UNKNOWN_GOAL, not confirmation', () => {
    const view = buildAskUserView(
      'This goal is outside the Mock planner grammar, or no unique supported control matched. N-Eye will not invent success.'
    );
    expect(view.reason).toBe('UNKNOWN_GOAL');
    expect(view.headline).toBe('I need your help');
    expect(view.continueLabel).toBe('Continue');
    expect(view.dismissLabel).toBe('Cancel');
    expect(isAskUserApprovalCopy(view.continueLabel)).toBe(false);
    expect(isAskUserApprovalCopy(view.dismissLabel)).toBe(false);
    expect(view.message).not.toMatch(/Mock planner grammar/i);
    expect(view.hint).toMatch(/not an approval/i);
  });

  it('classifies ambiguous and custom-select paths without minting Allow/Deny', () => {
    expect(classifyAskUser('Multiple matching text fields. N-Eye will not guess which one to type into.')).toBe(
      'AMBIGUOUS_TARGET'
    );
    expect(classifyAskUser('SELECT needs a unique native select. Custom widgets are not guessed.')).toBe(
      'CUSTOM_SELECT'
    );
    expect(classifyAskUser('Multiple equivalent fields.')).toBe('MULTIPLE_CANDIDATES');
    expect(classifyAskUser('This high-risk action could not be verified.')).toBe('HIGH_UNVERIFIED');
    expect(classifyAskUser('Text is in the search field, but search was not submitted. This is not task completion.')).toBe(
      'PARTIAL_GOAL'
    );
    expect(buildAskUserView('Text is in the search field, but search was not submitted.').continueLabel).not.toMatch(
      /allow once/i
    );
  });
});

describe('human-first compact copy', () => {
  it('keeps SafeContext/OCR/PageEpoch/EgressGuard out of default status headlines', () => {
    const phases = [
      'READY',
      'OBSERVING',
      'PERCEIVING',
      'PROTECTING',
      'PLANNING',
      'VALIDATING',
      'ACTING',
      'VERIFYING',
      'ASK_USER',
      'AWAITING_CONFIRMATION',
      'RATE_LIMITED',
      'GATEWAY_UNREACHABLE',
    ] as const;
    for (const phase of phases) {
      const copy = statusCopy(phase);
      expect(compactContainsForbiddenJargon(`${copy.headline} ${copy.message}`)).toBe(false);
      expect(copy.headline).not.toMatch(/\bOCR\b/);
      expect(copy.message).not.toMatch(/\bOCR\b/);
    }
    expect(statusCopy('ASK_USER').headline).toBe('I need your help');
    expect(statusCopy('AWAITING_CONFIRMATION').headline).toBe('N-Eye needs your approval');
    expect(screenshotOutboundLabel(0)).toBe('No screenshot was sent');
    expect(formatPayloadBytes(21176)).toBe('21 KB');
    expect(pipelineRailLabel('SEE')).toBe('Look');
    expect(pipelineStageHelp('PROTECT')).toMatch(/Protecting your information/);
  });
});

describe('ASK_USER overlay recovery vs confirmation', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    unmountOverlay();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(),
        getURL: (path: string) => `chrome-extension://n-eye/${path}`,
      },
    });
  });

  it('shows Continue/Cancel and never Confirm when ASK_USER', () => {
    const handle = mountOverlay(document);
    const idle = createIdleState();
    const ask = buildAskUserView('This goal is outside the Mock planner grammar.');
    applyOverlayState(
      {
        ...idle,
        phase: 'ASK_USER',
        headline: ask.headline,
        message: ask.message,
        askUser: ask,
        running: false,
        canRun: true,
      },
      'dark'
    );
    expect(handle.els.confirmBox.classList.contains('nq-hidden')).toBe(true);
    expect(handle.els.run.textContent).toBe('Continue');
    expect(handle.els.cancel.classList.contains('nq-hidden')).toBe(false);
    expect(handle.els.cancel.textContent).toBe('Cancel');
    expect(handle.els.goal.disabled).toBe(false);
    expect(handle.els.askHint.classList.contains('nq-hidden')).toBe(false);
    handle.els.confirmOk.click();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: 'confirm' })
    );
    handle.els.run.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'run' })
    );
    handle.els.cancel.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'cancel' })
    );
  });
});
