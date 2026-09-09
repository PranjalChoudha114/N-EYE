import type { BoundingBox } from '@n-eye/protocol';

/**
 * SIH visual metrics (evaluation only).
 * Independent of perception/grounding implementations. Ground truth must come from JSON fixtures.
 */

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function exactMatch(predicted: string, expected: string): boolean {
  return predicted === expected;
}

export function normalizedContains(predicted: string, expected: string): boolean {
  return normalizeText(predicted).includes(normalizeText(expected));
}

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    const row = matrix[i];
    if (row) row[0] = i;
  }
  const first = matrix[0];
  if (first) {
    for (let j = 0; j < cols; j++) first[j] = j;
  }
  for (let i = 1; i < rows; i++) {
    const row = matrix[i];
    const prev = matrix[i - 1];
    if (!row || !prev) continue;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
  }
  return matrix[a.length]?.[b.length] ?? Math.max(a.length, b.length);
}

export function characterErrorRate(predicted: string, expected: string): number {
  if (expected.length === 0) return predicted.length === 0 ? 0 : 1;
  return levenshtein(normalizeText(predicted), normalizeText(expected)) / normalizeText(expected).length;
}

export function boxIou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

export function pointInBox(x: number, y: number, box: BoundingBox): boolean {
  return x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height;
}

export function precisionRecallF1(
  tp: number,
  fp: number,
  fn: number
): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function percentile(sortedAscending: number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  const idx = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAscending.length) - 1));
  return sortedAscending[idx] ?? null;
}

/**
 * Wilson score interval for a binomial proportion (z=1.96 → ~95%).
 * WHY: Small fixture N must not be published as a point percentage without a range.
 */
export function wilsonScoreInterval(
  successes: number,
  n: number,
  z = 1.96
): { low: number; high: number } | null {
  if (n <= 0 || successes < 0 || successes > n) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  };
}

export function formatWilson(successes: number, n: number): string {
  const iv = wilsonScoreInterval(successes, n);
  if (!iv) return 'n/a';
  return `${(iv.low * 100).toFixed(1)}–${(iv.high * 100).toFixed(1)}%`;
}

export function summarizeSamples(values: number[]): {
  count: number;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  mean: number | null;
} {
  if (values.length === 0) {
    return { count: 0, min: null, max: null, p50: null, p95: null, mean: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    p50: percentile(sorted, 50),
    p95: sorted.length >= 5 ? percentile(sorted, 95) : null,
    mean: sum / sorted.length,
  };
}
