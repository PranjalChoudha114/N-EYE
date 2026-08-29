import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageEpochManager } from '../content/epoch.js';

describe('PageEpoch storm coalescing', () => {
  let epochMgr: PageEpochManager;

  beforeEach(() => {
    document.body.innerHTML = `<div id="host"><button id="go">Go</button></div>`;
    epochMgr = new PageEpochManager(20);
  });

  afterEach(() => {
    epochMgr.disconnect();
  });

  it('coalesces a mutation storm into a bounded epoch advance', async () => {
    const host = document.getElementById('host') as HTMLDivElement;
    const before = epochMgr.getEpoch();
    for (let i = 0; i < 40; i++) {
      const extra = document.createElement('button');
      extra.textContent = `n${i}`;
      host.appendChild(extra);
      extra.remove();
    }
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 40));
    const after = epochMgr.getEpoch();
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThanOrEqual(3);
    expect(epochMgr.getStormCount()).toBeGreaterThan(0);
  });
});
