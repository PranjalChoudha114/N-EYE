import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageEpochManager } from '../content/epoch.js';

describe('PageEpochManager (Freshness & Mutation Tracking)', () => {
  let epochMgr: PageEpochManager;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div><button id="initial-btn">Initial</button></div>';
    epochMgr = new PageEpochManager(50);
  });

  afterEach(() => {
    epochMgr.disconnect();
    vi.useRealTimers();
  });

  it('initializes at Epoch 1', () => {
    expect(epochMgr.getEpoch()).toBe(1);
  });

  it('manually increments epoch correctly', () => {
    epochMgr.increment();
    expect(epochMgr.getEpoch()).toBe(2);

    epochMgr.increment();
    expect(epochMgr.getEpoch()).toBe(3);
  });

  it('resets epoch to 1 on reset()', () => {
    epochMgr.increment();
    epochMgr.increment();
    expect(epochMgr.getEpoch()).toBe(3);

    epochMgr.reset();
    expect(epochMgr.getEpoch()).toBe(1);
  });

  it('calls onEpochChange callback when epoch increments', () => {
    const callback = vi.fn();
    const mgr = new PageEpochManager(50, callback);

    mgr.increment();
    expect(callback).toHaveBeenCalledWith(2);
    mgr.disconnect();
  });
});
