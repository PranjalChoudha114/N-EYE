import { describe, it, expect } from 'vitest';
import {
  characterErrorRate,
  exactMatch,
  normalizedContains,
  percentile,
  pointInBox,
  precisionRecallF1,
  summarizeSamples,
} from '../eval/metrics.js';

describe('Evaluation metric formulas', () => {
  it('computes exact, normalized, CER, IoU-independent point-in-box, and F1', () => {
    expect(exactMatch('HELLO', 'HELLO')).toBe(true);
    expect(normalizedContains('hello  neye', 'HELLO NEYE')).toBe(true);
    expect(characterErrorRate('HELLO', 'HELLO')).toBe(0);
    expect(pointInBox(15, 15, { x: 10, y: 10, width: 10, height: 10 })).toBe(true);
    expect(pointInBox(5, 5, { x: 10, y: 10, width: 10, height: 10 })).toBe(false);
    expect(precisionRecallF1(8, 2, 2).precision).toBeCloseTo(0.8);
    expect(precisionRecallF1(8, 2, 2).recall).toBeCloseTo(0.8);
    expect(precisionRecallF1(8, 2, 2).f1).toBeCloseTo(0.8);
  });

  it('does not report p95 for a single sample', () => {
    expect(percentile([3], 95)).toBe(3);
    const one = summarizeSamples([12]);
    expect(one.count).toBe(1);
    expect(one.p95).toBeNull();
    const five = summarizeSamples([1, 2, 3, 4, 10]);
    expect(five.p95).not.toBeNull();
  });
});
