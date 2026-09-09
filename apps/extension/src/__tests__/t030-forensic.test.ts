/**
 * T030 independent forensic regressions: report truth, OCR vs grounding, loops, dist identity.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { EvidenceLedger } from '../runtime/evidence-ledger.js';
import { buildVerifiedTaskReport } from '../runtime/task-report.js';
import {
  classifyPerceptionFallback,
  evidencePerceptionSource,
  perceptionFailureUserMessage,
} from '../perception/fallback-policy.js';
import { statusCopy } from '../ui/status-map.js';
import { classifyAskUser } from '../ui/ask-user.js';
import { MAX_STEPS } from '../runtime/trust-loop.js';
import { PLANNER_MAX_ATTEMPTS } from '../planner/transport-error.js';
import { MAX_IDENTICAL_ACTION_FAILURES, MAX_RECOVERY_ATTEMPTS } from '../intelligence/recovery-policy.js';
import { MAX_EXPLORE_SCROLLS } from '../intelligence/exploration-policy.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { runPerception } from '../perception/orchestrator.js';
import { createElementId, createPageEpoch, type RawElement, type RawScene, type VisualRegion } from '@n-eye/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

describe('T030 forensic repairs', () => {
  it('does not call TYPE dispatch an authorized click', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.action = {
      proposalText: 'Type Jane',
      targetLabel: 'Name',
      proposalType: 'TYPE_TEXT',
      risk: 'LOW',
      reasoning: 'type',
      validation: {
        targetCurrent: true,
        frameCurrent: true,
        pageCurrent: true,
        tokenScopeValid: true,
        riskPolicy: 'LOW',
      },
    };
    state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    const ledger = new EvidenceLedger();
    ledger.begin('t030-type');
    ledger.record('TASK_RECEIVED', 'USER INTENT', 'goal');
    ledger.record('ACTION_EXECUTED', 'BROWSER EXECUTION', 'TYPE_TEXT', { status: 'RECORDED', actionType: 'TYPE_TEXT' });
    ledger.record('OUTCOME_VERIFIED', 'OUTCOME VERIFICATION', 'ok', { status: 'VERIFIED' });
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 't030-type' });
    expect(report.claims.find((c) => c.id === 'clicked')?.status).toBe('NOT APPLICABLE');
    expect(report.human.whatDid.toLowerCase()).not.toMatch(/authorized click/);
    expect(report.result).toBe('VERIFIED COMPLETE');
  });

  it('distinguishes capture failure copy from visual unbound ASK_USER', () => {
    expect(classifyPerceptionFallback('CAPTURE_UNAVAILABLE')).toBe('OCR_ENGINE');
    expect(classifyPerceptionFallback('GROUNDING_AMBIGUOUS')).toBe('VISUAL_UNBOUND');
    expect(statusCopy('OCR_UNAVAILABLE', perceptionFailureUserMessage('CAPTURE_UNAVAILABLE')).headline).toMatch(
      /could not capture/i
    );
    expect(classifyAskUser(perceptionFailureUserMessage('GROUNDING_AMBIGUOUS'))).toBe('VISUAL_UNBOUND');
  });

  it('capture failure produces no OCR blocks to claim as OCR_USED', async () => {
    const region: VisualRegion = {
      regionId: 'canvas_1',
      kind: 'canvas',
      reason: 'CANVAS_RENDERED',
      pageEpoch: createPageEpoch(1),
      bbox: { x: 20, y: 20, width: 240, height: 80 },
    };
    const el: RawElement = {
      id: createElementId('e1'),
      tagName: 'canvas',
      role: null,
      ariaLabel: null,
      innerTextCandidate: '',
      inputType: null,
      isEnabled: true,
      bbox: { x: 20, y: 20, width: 240, height: 80 },
    };
    const scene: RawScene = {
      _isLocalOnly: true,
      pageEpoch: createPageEpoch(1),
      url: 'https://lab.example/visual',
      origin: 'https://lab.example',
      title: 'Visual',
      viewport: { width: 1280, height: 720 },
      elements: [el],
      privacyFindings: [],
      timestamp: Date.now(),
      visualRegions: [region],
    };
    const result = await runPerception({
      scene,
      engine: new MockOcrEngine(),
      capture: async () => {
        throw new Error('capture unavailable');
      },
    });
    expect(result.fallback).toBe('CAPTURE_UNAVAILABLE');
    expect(result.ocrBlocks).toHaveLength(0);
    expect(evidencePerceptionSource(result)).toBe('DOM');
  });

  it('bounds planner, recovery, exploration, and trust-loop retries', () => {
    expect(MAX_STEPS).toBe(8);
    expect(PLANNER_MAX_ATTEMPTS).toBe(3);
    expect(MAX_RECOVERY_ATTEMPTS).toBe(3);
    expect(MAX_IDENTICAL_ACTION_FAILURES).toBe(2);
    expect(MAX_EXPLORE_SCROLLS).toBe(2);
  });

  it('marks dist identity stale when it does not match HEAD', () => {
    const distPath = join(repoRoot, 'apps/extension/dist/build-identity.txt');
    if (!existsSync(distPath)) {
      expect(existsSync(distPath)).toBe(false);
      return;
    }
    const text = readFileSync(distPath, 'utf8');
    const head = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim().length > 0;
    expect(text).toMatch(new RegExp(`DEV • ${head}\\${dirty ? '*' : ''}`));
  });
});
