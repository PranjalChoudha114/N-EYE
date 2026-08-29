import { describe, it, expect, afterEach } from 'vitest';
import { mutationsRequireEpochAdvance } from '../content/mutation-policy.js';

async function captureMutations(act: () => void, options?: MutationObserverInit): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((mutations) => {
    records.push(...mutations);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      'hidden',
      'aria-hidden',
      'disabled',
      'aria-disabled',
      'aria-label',
      'role',
      'class',
      'style',
    ],
    ...options,
  });
  act();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  observer.disconnect();
  return records;
}

describe('Mutation classification policy', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('treats adding or removing an actionable child as semantic', async () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById('host') as HTMLDivElement;
    const added = await captureMutations(() => {
      const btn = document.createElement('button');
      btn.textContent = 'Continue';
      host.appendChild(btn);
    });
    expect(mutationsRequireEpochAdvance(added)).toBe(true);

    const removed = await captureMutations(() => {
      host.replaceChildren();
    });
    expect(mutationsRequireEpochAdvance(removed)).toBe(true);
  });

  it('treats actionable label, aria-label, role, disabled, and visibility as semantic', async () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const btn = document.getElementById('go') as HTMLButtonElement;

    expect(mutationsRequireEpochAdvance(await captureMutations(() => { btn.setAttribute('aria-label', 'Go next'); }))).toBe(true);
    expect(mutationsRequireEpochAdvance(await captureMutations(() => { btn.setAttribute('role', 'link'); }))).toBe(true);
    expect(mutationsRequireEpochAdvance(await captureMutations(() => { btn.disabled = true; }))).toBe(true);
    expect(mutationsRequireEpochAdvance(await captureMutations(() => { btn.hidden = true; }))).toBe(true);
  });

  it('treats characterData on a button as semantic and a timestamp span as noise', async () => {
    document.body.innerHTML = `<button id="go">Continue</button><span id="clock">12:00</span>`;
    const btn = document.getElementById('go') as HTMLButtonElement;
    const clock = document.getElementById('clock') as HTMLSpanElement;

    const labelChange = await captureMutations(() => {
      if (btn.firstChild) {
        btn.firstChild.textContent = 'Delete account';
      }
    });
    expect(labelChange.length).toBeGreaterThan(0);
    expect(mutationsRequireEpochAdvance(labelChange)).toBe(true);

    const noise = await captureMutations(() => {
      clock.textContent = '12:01';
    });
    expect(mutationsRequireEpochAdvance(noise)).toBe(false);
  });

  it('ignores hidden-subtree churn and cosmetic class/color changes', async () => {
    document.body.innerHTML = `
      <div id="hidden-host" hidden><button>Secret</button></div>
      <button id="go" class="btn">Continue</button>
    `;
    const hiddenHost = document.getElementById('hidden-host') as HTMLDivElement;
    const btn = document.getElementById('go') as HTMLButtonElement;

    const hidden = await captureMutations(() => {
      const extra = document.createElement('span');
      extra.textContent = 'noise';
      hiddenHost.appendChild(extra);
    });
    expect(mutationsRequireEpochAdvance(hidden)).toBe(false);

    const cosmetic = await captureMutations(() => {
      btn.className = 'btn hovered';
      btn.style.color = 'red';
    });
    expect(mutationsRequireEpochAdvance(cosmetic)).toBe(false);
  });

  it('treats style/class changes that hide or disable a control as semantic', async () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const btn = document.getElementById('go') as HTMLButtonElement;
    const hidden = await captureMutations(() => {
      btn.style.display = 'none';
    });
    expect(mutationsRequireEpochAdvance(hidden)).toBe(true);
    btn.style.display = '';
    const disabledClass = await captureMutations(() => {
      btn.className = 'disabled';
    });
    expect(mutationsRequireEpochAdvance(disabledClass)).toBe(true);
  });
});
