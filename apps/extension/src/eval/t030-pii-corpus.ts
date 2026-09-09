/**
 * T030 frozen PII partitions.
 * OWNS: Development = T027 corpus. Holdout = bench/t030 JSON (never used to retune).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { T027_PII_DATASET_VERSION, T027_PII_SAMPLES, type PiiSample } from './pii-corpus.js';

const here = dirname(fileURLToPath(import.meta.url));
export const T030_PII_HOLDOUT_PATH = join(here, '../../../../bench/t030/privacy/t030-pii-holdout.v1.json');

export const T030_PII_DEV_VERSION = T027_PII_DATASET_VERSION;
export const T030_PII_HOLDOUT_VERSION = 't030-pii-holdout/1';

export interface T030PiiFile {
  version: string;
  frozen: boolean;
  notes: string;
  samples: Array<PiiSample & { classTag?: string }>;
}

export function loadT030PiiHoldout(): T030PiiFile {
  const parsed = JSON.parse(readFileSync(T030_PII_HOLDOUT_PATH, 'utf8')) as T030PiiFile;
  if (parsed.version !== T030_PII_HOLDOUT_VERSION) {
    throw new Error(`Holdout version drift: ${parsed.version}`);
  }
  if (!parsed.frozen) throw new Error('T030 PII holdout must remain frozen.');
  return parsed;
}

export function t030DevelopmentPii(): PiiSample[] {
  return T027_PII_SAMPLES;
}

export function t030HoldoutPii(): PiiSample[] {
  return loadT030PiiHoldout().samples.map((row) => {
    const { classTag: _tag, ...sample } = row;
    void _tag;
    return sample;
  });
}

export function t030HoldoutClassTag(id: string): string {
  return loadT030PiiHoldout().samples.find((s) => s.id === id)?.classTag || 'unspecified';
}
