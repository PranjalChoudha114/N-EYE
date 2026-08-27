import { describe, it, expect, beforeEach } from 'vitest';
import { ElementRegistry } from '../content/registry.js';
import { createPageEpoch, createTargetFingerprint } from '@n-eye/protocol';

describe('ElementRegistry (Target Identity & Lifecycle)', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = '';
  });

  it('assigns opaque sequential ElementIds (e1, e2, ...)', () => {
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    document.body.appendChild(btn1);
    document.body.appendChild(btn2);

    const fp = createTargetFingerprint('button', 'button', null, 'Click', {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 10,
      heightPercent: 5,
    });

    const id1 = registry.register(btn1, createPageEpoch(1), fp);
    const id2 = registry.register(btn2, createPageEpoch(1), fp);

    expect(id1).toBe('e1');
    expect(id2).toBe('e2');
    expect(registry.size()).toBe(2);
  });

  it('resolves live node reference for attached elements', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const fp = createTargetFingerprint('textbox', 'input', 'text', 'Name', {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 20,
      heightPercent: 5,
    });

    const id = registry.register(input, createPageEpoch(1), fp);
    const resolved = registry.getLiveNode(id);

    expect(resolved).toBe(input);
    expect(registry.isAttached(id)).toBe(true);
  });

  it('returns null for detached DOM elements', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    const fp = createTargetFingerprint('button', 'button', null, 'Submit', {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 10,
      heightPercent: 5,
    });

    const id = registry.register(btn, createPageEpoch(1), fp);
    expect(registry.getLiveNode(id)).toBe(btn);

    // Remove from DOM
    btn.remove();

    expect(registry.isAttached(id)).toBe(false);
    expect(registry.getLiveNode(id)).toBeNull();
  });

  it('purges detached nodes during cleanupDetached()', () => {
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    document.body.appendChild(btn1);
    document.body.appendChild(btn2);

    const fp = createTargetFingerprint('button', 'button', null, 'Btn', {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 10,
      heightPercent: 5,
    });

    registry.register(btn1, createPageEpoch(1), fp);
    const id2 = registry.register(btn2, createPageEpoch(1), fp);

    btn1.remove(); // Detach btn1

    const purged = registry.cleanupDetached();
    expect(purged).toBe(1);
    expect(registry.size()).toBe(1);
    expect(registry.get(id2)).toBeDefined();
  });

  it('clears all entries on clear()', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    const fp = createTargetFingerprint('button', 'button', null, 'Btn', {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 10,
      heightPercent: 5,
    });

    registry.register(btn, createPageEpoch(1), fp);
    expect(registry.size()).toBe(1);

    registry.clear();
    expect(registry.size()).toBe(0);
  });
});
