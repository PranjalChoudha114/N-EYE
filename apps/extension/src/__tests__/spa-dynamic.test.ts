import { describe, it, expect, beforeEach } from 'vitest';
import {
  createActionId,
  createPageEpoch,
  createTaskId,
  type ActionProposal,
} from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { PageEpochManager } from '../content/epoch.js';

function clickProposal(targetId: ActionProposal['targetId']): ActionProposal {
  return {
    actionId: createActionId('act-spa'),
    type: 'CLICK',
    targetId,
    reasoning: 'Click target',
    expectedOutcome: 'Activate',
    riskLevel: 'LOW',
  };
}

describe('Dynamic SPA stale-action scenarios', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = '';
  });

  it('SPA-1: same semantic target that moved remains executable', () => {
    document.body.innerHTML = `<div id="slot" style="margin-top:0"><button id="go">Continue</button></div>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements.find((el) => el.innerTextCandidate === 'Continue');
    if (!target) throw new Error('missing Continue');
    const validated = validateActionProposal(
      clickProposal(target.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('spa-1'),
      'https://example.com'
    );

    const slot = document.getElementById('slot') as HTMLDivElement;
    slot.style.marginTop = '40px';

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(true);
    expect(result.outcome).toBe('SAFE_REGROUND');
  });

  it('SPA-2: equivalent replacement in the same context is safely re-grounded', () => {
    document.body.innerHTML = `<div id="slot"><button id="go">Continue</button></div>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const validated = validateActionProposal(
      clickProposal(target.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('spa-2'),
      'https://example.com'
    );

    const slot = document.getElementById('slot') as HTMLDivElement;
    slot.innerHTML = `<button id="go-2">Continue</button>`;

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(true);
    expect(result.outcome).toBe('SAFE_REGROUND');
  });

  it('SPA-3: Continue replaced by Delete at the same node must never click', () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const validated = validateActionProposal(
      clickProposal(target.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('spa-3'),
      'https://example.com'
    );

    const btn = document.getElementById('go') as HTMLButtonElement;
    btn.textContent = 'Delete account';

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('BLOCK');
    expect(result.error).toMatch(/semantic/i);
  });

  it('SPA-4: duplicate Continue candidates abstain', () => {
    document.body.innerHTML = `<div id="slot"><button id="go">Continue</button></div>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const validated = validateActionProposal(
      clickProposal(target.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('spa-4'),
      'https://example.com'
    );

    const slot = document.getElementById('slot') as HTMLDivElement;
    slot.innerHTML = `<button>Continue</button><button>Continue</button>`;

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('REOBSERVE');
    expect(result.error).toMatch(/multiple|abstain|plausible/i);
  });

  it('SPA-5: disabled target cannot execute', () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const validated = validateActionProposal(
      clickProposal(target.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('spa-5'),
      'https://example.com'
    );
    (document.getElementById('go') as HTMLButtonElement).disabled = true;
    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('BLOCK');
  });

  it('SPA-6: hidden target cannot execute', () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const validated = validateActionProposal(
      clickProposal(target.id),
      scene,
      new PrivateTokenVault(),
      createTaskId('spa-6'),
      'https://example.com'
    );
    (document.getElementById('go') as HTMLButtonElement).hidden = true;
    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('BLOCK');
  });

  it('SPA-7: pathname change invalidates the old proposal', () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const validated = {
      ...validateActionProposal(
        clickProposal(target.id),
        scene,
        new PrivateTokenVault(),
        createTaskId('spa-7'),
        'https://example.com'
      ),
      observedUrl: `${window.location.origin}/spa-route-changed`,
    };

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('REOBSERVE');
    expect(result.error).toMatch(/route/i);
  });

  it('SPA-8: relevant characterData is classified as semantic', async () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const epoch = new PageEpochManager(10);
    const before = epoch.getEpoch();
    const btn = document.getElementById('go') as HTMLButtonElement;
    btn.textContent = 'Review';
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(epoch.getEpoch()).toBeGreaterThan(before);
    epoch.disconnect();
  });

  it('SPA-9: timestamp noise does not advance PageEpoch', async () => {
    document.body.innerHTML = `<button id="go">Continue</button><span id="clock">1</span>`;
    const epoch = new PageEpochManager(10);
    const before = epoch.getEpoch();
    const clock = document.getElementById('clock') as HTMLSpanElement;
    for (let i = 0; i < 12; i++) {
      clock.textContent = String(i);
    }
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(epoch.getEpoch()).toBe(before);
    epoch.disconnect();
  });
});
