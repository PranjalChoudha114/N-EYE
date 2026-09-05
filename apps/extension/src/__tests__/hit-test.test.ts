import { describe, expect, it } from 'vitest';
import { clickHitTest } from '../execution/hit-test.js';

describe('Pointer hit-test', () => {
  it('treats missing elementFromPoint as non-occlusion (jsdom/happy-dom)', () => {
    document.body.innerHTML = `<button id="go" style="width:80px;height:32px">Go</button>`;
    const btn = document.getElementById('go');
    if (!(btn instanceof HTMLButtonElement)) throw new Error('missing');
    expect(clickHitTest(btn).ok).toBe(true);
  });

  it('reports occlusion when another element sits at the target center', () => {
    document.body.innerHTML = `
      <button id="go" style="position:absolute;left:0;top:0;width:80px;height:32px">Go</button>
      <div id="mask" style="position:absolute;left:0;top:0;width:80px;height:32px;background:#000">overlay</div>
    `;
    const btn = document.getElementById('go');
    const mask = document.getElementById('mask');
    if (!(btn instanceof HTMLButtonElement) || !(mask instanceof HTMLElement)) throw new Error('missing');
    btn.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 80, height: 32, top: 0, left: 0, right: 80, bottom: 32, toJSON: () => ({}) }) as DOMRect;
    const orig = document.elementsFromPoint;
    document.elementsFromPoint = () => [mask, btn];
    try {
      expect(clickHitTest(btn)).toEqual({ ok: false, reason: 'occluded' });
    } finally {
      document.elementsFromPoint = orig;
    }
  });

  it('skips pointer-events:none overlays', () => {
    document.body.innerHTML = `
      <button id="go" style="position:absolute;left:0;top:0;width:80px;height:32px">Go</button>
      <div id="ghost" style="position:absolute;left:0;top:0;width:80px;height:32px;pointer-events:none">ghost</div>
    `;
    const btn = document.getElementById('go');
    const ghost = document.getElementById('ghost');
    if (!(btn instanceof HTMLButtonElement) || !(ghost instanceof HTMLElement)) throw new Error('missing');
    btn.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 80, height: 32, top: 0, left: 0, right: 80, bottom: 32, toJSON: () => ({}) }) as DOMRect;
    const orig = document.elementsFromPoint;
    document.elementsFromPoint = () => [ghost, btn];
    try {
      expect(clickHitTest(btn).ok).toBe(true);
    } finally {
      document.elementsFromPoint = orig;
    }
  });
});
