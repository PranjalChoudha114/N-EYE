import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  T029_CORPUS_VERSION,
  T029_FROZEN_HOLDOUT_IDS,
  buildT029JudgeKillCorpus,
  scoreT029Case,
  summarizeT029,
} from '../eval/t029-judge-kill.js';

const WRITE = process.env['N_EYE_BENCH_WRITE'] === '1';

describe('T029 Judge-Kill corpus t029-judge-kill/1', () => {
  const corpus = buildT029JudgeKillCorpus();
  const results = corpus.map(scoreT029Case);
  const summary = summarizeT029(results);

  it('has 100+ meaningful cases and a frozen 32-id holdout', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(100);
    expect(summary.holdout).toBe(32);
    const holdIds = corpus.filter((c) => c.split === 'holdout').map((c) => c.id);
    expect(holdIds).toEqual([...T029_FROZEN_HOLDOUT_IDS]);
    expect(new Set(corpus.map((c) => c.id)).size).toBe(corpus.length);
  });

  it('development and frozen holdout both score on this working tree', () => {
    const failures = results.filter((r) => !r.pass);
    if (WRITE) {
      const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../../bench/judge-kill');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 't029-judge-kill.json'),
        JSON.stringify(
          {
            corpusVersion: T029_CORPUS_VERSION,
            runtime: 'Node/happy-dom',
            classification: 'TESTED',
            measuredAt: new Date().toISOString(),
            summary,
            failures: failures.map((f) => ({ id: f.id, expected: f.expected, actual: f.actual })),
            results,
          },
          null,
          2
        )
      );
    }
    expect(failures, failures.map((f) => `${f.id}: expected ${f.expected} got ${f.actual}`).join('\n')).toEqual([]);
  });
});
