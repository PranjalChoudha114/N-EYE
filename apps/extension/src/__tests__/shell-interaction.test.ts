/**
 * Side Panel control-contract tests.
 * WHY: Tab buttons now contain decorative SVGs. Clicks on those children must still switch tabs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { mountProductShell } from '../ui/shell.js';
import { bindProductUi } from '../ui/render.js';

describe('Side Panel interaction', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `/${path}`,
        getManifest: () => ({ version_name: 'DEV • test' }),
      },
    });
  });

  it('Activity / Privacy / Evidence tabs respond to clicks on their icon children', () => {
    const els = mountProductShell(document);
    const ui = bindProductUi(els);
    ui.update(createIdleState(), { role: 'owner', themePref: 'dark' });
    ui.setDetailsOpen(true);

    const privacy = els.tabs.querySelector('[data-tab="privacy"]');
    const evidence = els.tabs.querySelector('[data-tab="evidence"]');
    const activity = els.tabs.querySelector('[data-tab="activity"]');
    expect(privacy).toBeInstanceOf(HTMLButtonElement);
    privacy?.querySelector('svg')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(privacy?.getAttribute('aria-selected')).toBe('true');
    expect(els.panelPrivacy.classList.contains('hidden')).toBe(false);
    expect(els.panelActivity.classList.contains('hidden')).toBe(true);

    evidence?.querySelector('svg')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(evidence?.getAttribute('aria-selected')).toBe('true');
    expect(els.panelEvidence.classList.contains('hidden')).toBe(false);

    activity?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activity?.getAttribute('aria-selected')).toBe('true');
    expect(els.panelActivity.classList.contains('hidden')).toBe(false);
  });

  it('does not scale Side Panel buttons on :active (click-swallow)', () => {
    const css = readFileSync(resolve(__dirname, '../ui/product.css'), 'utf8');
    expect(css).not.toMatch(/\.n-btn:active[^{]*\{[^}]*transform:\s*scale/);
    expect(css).not.toMatch(/\.n-tab:active[^{]*\{[^}]*transform:\s*scale/);
  });
});
