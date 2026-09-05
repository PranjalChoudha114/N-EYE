import { describe, it, expect, beforeEach } from 'vitest';
import { ElementRegistry } from '../content/registry.js';
import { regroundTarget, TargetStaleError } from '../authority/regrounding.js';
import { createPageEpoch, createTargetFingerprint, createElementId } from '@n-eye/protocol';

describe('Live Re-Grounding Authority', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = `
      <div id="container">
        <button id="btn-submit">Submit Application</button>
        <button id="btn-cancel">Cancel</button>
      </div>
    `;
  });

  it('successfully re-grounds live mounted element with matching fingerprint', () => {
    const btn = document.getElementById('btn-submit') as HTMLButtonElement;
    const epoch = createPageEpoch(1);
    const fp = createTargetFingerprint('button', 'button', 'submit', 'Submit Application', {
      xPercent: 10,
      yPercent: 10,
      widthPercent: 20,
      heightPercent: 5,
    });

    const elemId = registry.register(btn, epoch, fp);
    const result = regroundTarget(elemId, registry, fp);

    expect(result.node).toBe(btn);
    expect(result.isFingerprintMatch).toBe(true);
  });

  it('blocks re-grounding and throws TargetStaleError when target element is detached from DOM', () => {
    const btn = document.getElementById('btn-submit') as HTMLButtonElement;
    const epoch = createPageEpoch(1);
    const fp = createTargetFingerprint('button', 'button', 'submit', 'Submit Application', {
      xPercent: 10,
      yPercent: 10,
      widthPercent: 20,
      heightPercent: 5,
    });
    const elemId = registry.register(btn, epoch, fp);

    // Detach button from DOM
    btn.remove();

    expect(() => {
      regroundTarget(elemId, registry);
    }).toThrow(TargetStaleError);
  });

  it('blocks re-grounding when target ID is unknown', () => {
    const unknownId = createElementId('e9999');
    expect(() => {
      regroundTarget(unknownId, registry);
    }).toThrow(TargetStaleError);
  });

  it('reports fingerprint mismatch when live control semantics diverge', () => {
    const btn = document.getElementById('btn-submit') as HTMLButtonElement;
    const epoch = createPageEpoch(1);
    const fp = createTargetFingerprint('button', 'button', 'submit', 'Submit Application', {
      xPercent: 10,
      yPercent: 10,
      widthPercent: 20,
      heightPercent: 5,
    });
    const elemId = registry.register(btn, epoch, fp);

    btn.textContent = 'Delete Account';
    expect(() => {
      regroundTarget(elemId, registry, fp);
    }).toThrow(TargetStaleError);
  });
});
