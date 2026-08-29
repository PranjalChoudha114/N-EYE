import { describe, it, expect, beforeEach } from 'vitest';
import {
  createActionId,
  createPageEpoch,
  createTaskId,
  TOP_FRAME_ID,
  type ActionProposal,
} from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { discoverFrames } from '../content/frames.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';

function clickProposal(targetId: ActionProposal['targetId']): ActionProposal {
  return {
    actionId: createActionId('act-frame'),
    type: 'CLICK',
    targetId,
    reasoning: 'Click framed target',
    expectedOutcome: 'Activate',
    riskLevel: 'LOW',
  };
}

function mountSameOriginFrame(html: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'same-origin-lab');
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error('expected same-origin iframe document');
  doc.open();
  doc.write(`<!DOCTYPE html><html><body>${html}</body></html>`);
  doc.close();
  return iframe;
}

describe('Frame provenance and collision safety', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = '';
  });

  it('namespaced IDs prevent top/frame collisions and preserve opaque frameId', () => {
    document.body.innerHTML = `<button id="top-go">Continue</button>`;
    mountSameOriginFrame(`<button id="frame-go">Continue</button>`);
    const scene = observePage(registry, createPageEpoch(1));

    const top = scene.elements.find((el) => el.frameProvenance?.frameId === TOP_FRAME_ID);
    const framed = scene.elements.find((el) => el.frameProvenance?.frameKind === 'same-origin');
    expect(top?.id).toBe('e1');
    expect(framed?.id).toMatch(/^f1e1$/);
    expect(top?.id).not.toBe(framed?.id);
    expect(framed?.frameProvenance?.frameId).toBe('f1');
  });

  it('executes the framed Continue, not the top Continue', () => {
    let topClicks = 0;
    let frameClicks = 0;
    document.body.innerHTML = `<button id="top-go">Continue</button>`;
    document.getElementById('top-go')?.addEventListener('click', () => {
      topClicks += 1;
    });
    const iframe = mountSameOriginFrame(`<button id="frame-go">Continue</button>`);
    iframe.contentDocument?.getElementById('frame-go')?.addEventListener('click', () => {
      frameClicks += 1;
    });

    const scene = observePage(registry, createPageEpoch(1));
    const framed = scene.elements.find((el) => el.frameProvenance?.frameKind === 'same-origin');
    if (!framed) throw new Error('missing frame target');
    const validated = validateActionProposal(
      clickProposal(framed.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('frame-1'),
      window.location.origin
    );
    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(true);
    expect(frameClicks).toBe(1);
    expect(topClicks).toBe(0);
  });

  it('removed iframe invalidates stale frame authority', () => {
    document.body.innerHTML = `<button id="top-go">Other</button>`;
    const iframe = mountSameOriginFrame(`<button id="frame-go">Continue</button>`);
    const scene = observePage(registry, createPageEpoch(1));
    const framed = scene.elements.find((el) => el.frameProvenance?.frameKind === 'same-origin');
    if (!framed) throw new Error('missing frame target');
    const validated = validateActionProposal(
      clickProposal(framed.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('frame-2'),
      window.location.origin
    );
    iframe.remove();
    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('BLOCK');
  });

  it('duplicate labels across frames do not execute the wrong document', () => {
    document.body.innerHTML = `<button id="top-go">Save</button>`;
    mountSameOriginFrame(`<button id="frame-go">Save</button>`);
    const scene = observePage(registry, createPageEpoch(1));
    const top = scene.elements.find((el) => el.frameProvenance?.frameId === TOP_FRAME_ID);
    const framed = scene.elements.find((el) => el.frameProvenance?.frameKind === 'same-origin');
    expect(top?.innerTextCandidate).toBe('Save');
    expect(framed?.innerTextCandidate).toBe('Save');
    expect(top?.id).not.toBe(framed?.id);
  });

  it('inaccessible frames are recorded locally and never fabricated into targets', () => {
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentDocument', {
      get() {
        throw new DOMException('Blocked a frame with origin mismatch');
      },
    });
    document.body.appendChild(iframe);
    const scene = observePage(registry, createPageEpoch(1));
    expect(scene.inaccessibleFrames?.length).toBeGreaterThan(0);
    expect(scene.elements.every((el) => el.frameProvenance?.frameKind !== 'inaccessible')).toBe(true);
  });

  it('SafeContext carries opaque frameId only and never iframe URLs', () => {
    resetTokenCounters();
    document.body.innerHTML = `<button>Top</button>`;
    mountSameOriginFrame(`<button>Frame Continue</button><a href="https://secret.example/reset?token=abc">x</a>`);
    const scene = observePage(registry, createPageEpoch(1));
    const decisions = evaluatePrivacyPolicy(scene.privacyFindings);
    const safe = buildSafeContext(
      scene,
      'Click continue',
      decisions,
      new PrivateTokenVault(),
      createTaskId('frame-priv'),
      scene.privacyFindings
    );
    const framed = safe.safeElements.find((el) => el.frameId);
    expect(framed?.frameId).toBe('f1');
    const serialized = validateSafeContextEgress(safe);
    expect(serialized).not.toMatch(/https:\/\/secret\.example/);
    expect(serialized).not.toContain('token=abc');
    expect(serialized).not.toContain('inaccessibleFrames');
    expect(JSON.stringify(safe)).not.toMatch(/contentDocument/);
  });

  it('discoverFrames does not require all_frames permission expansion', () => {
    const frames = discoverFrames(document);
    expect(frames[0]?.frameId).toBe('top');
  });
});
