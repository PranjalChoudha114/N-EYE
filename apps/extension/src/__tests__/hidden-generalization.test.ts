/**
 * T021 held-out template evaluation.
 * Independence: HELD-OUT TEMPLATE EVALUATION (same agent). Not a blind lab.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { writeJson, writeText } from '../eval/bench-io.js';
import { buildHiddenCorpus } from '../eval/hidden-corpus.js';
import { hashHiddenCorpus, runHiddenGeneralization } from '../eval/hidden-runner.js';
import { HIDDEN_CORPUS_ID } from '../eval/hidden-types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const firstPassPath = join(repoRoot, 'bench/hidden/t021-first-pass.json');
const currentPath = join(repoRoot, 'bench/hidden/t021-current.json');

describe('T021 held-out template generalization', () => {
  it('seals corpus hash and records first-pass outcomes without site-specific production code', async () => {
    const cases = buildHiddenCorpus();
    expect(cases).toHaveLength(20);
    expect(new Set(cases.map((c) => c.siteClass)).size).toBe(20);
    const corpusHash = hashHiddenCorpus(cases);
    expect(corpusHash).toMatch(/^[a-f0-9]{64}$/);

    const summary = await runHiddenGeneralization();
    expect(summary.independence).toBe('HELD-OUT TEMPLATE EVALUATION');
    expect(summary.corpusId).toBe(HIDDEN_CORPUS_ID);
    expect(summary.corpusHash).toBe(corpusHash);
    expect(summary.n).toBe(20);
    expect(summary.falseComplete).toBe(0);
    expect(summary.wrongAction).toBe(0);
    expect(summary.privacyFail).toBe(0);

    writeJson(currentPath, summary);
    writeText(
      join(repoRoot, 'bench/hidden/t021-current.md'),
      [
        '# T021 held-out template evaluation (current)',
        '',
        `Corpus: \`${summary.corpusId}\``,
        `Hash: \`${summary.corpusHash}\``,
        `Independence: ${summary.independence}`,
        '',
        `| N | completed | correct abstention | wrong action | false complete | privacy pass |`,
        `|---:|---:|---:|---:|---:|---:|`,
        `| ${summary.n} | ${summary.completed} | ${summary.correctAbstention} | ${summary.wrongAction} | ${summary.falseComplete} | ${summary.privacyPass}/${summary.n} |`,
        '',
        '| class | N | completed | abstention | wrong | false complete | privacy | expected hit |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        ...summary.byClass.map(
          (c) =>
            `| ${c.siteClass} | ${c.n} | ${c.completed} | ${c.correctAbstention} | ${c.wrongAction} | ${c.falseComplete} | ${c.privacyPass} | ${c.expectedHit} |`
        ),
        '',
        ...summary.rows.map(
          (r) =>
            `- \`${r.id}\`: ${r.outcome} expected=${r.expected.join('|')} hit=${r.expectedHit} privacy=${r.privacyPass} wrong=${r.wrongAction} — ${r.detail}`
        ),
        '',
      ].join('\n')
    );

    if (!existsSync(firstPassPath) && process.env['N_EYE_SEAL_FIRST_PASS'] === '1') {
      writeJson(firstPassPath, {
        sealed: true,
        note: 'FIRST-PASS. Do not overwrite after repairs. Post-repair lives in t021-current.json.',
        summary,
      });
    }

    if (existsSync(firstPassPath)) {
      const locked = JSON.parse(readFileSync(firstPassPath, 'utf8')) as {
        summary: { corpusHash: string; wrongAction: number; falseComplete: number };
      };
      expect(locked.summary.corpusHash).toBe(corpusHash);
      expect(locked.summary.wrongAction).toBe(2);
      expect(locked.summary.falseComplete).toBe(0);
    }

    const productionTouch = createHash('sha256').update('apps/extension/src/planner/mock-grammar.ts').digest('hex');
    expect(productionTouch).toBeTruthy();
  }, 60_000);

  it('does not import hidden corpus from production packages', () => {
    const prodFiles = [
      join(here, '../planner/deterministic-planner.ts'),
      join(here, '../privacy/safe-context-builder.ts'),
      join(here, '../authority/validator.ts'),
      join(here, '../runtime/trust-loop.ts'),
    ];
    for (const file of prodFiles) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toContain('hidden-corpus');
      expect(text).not.toContain('heldout.example');
      expect(text).not.toContain('fld_enquiry_q7');
    }
  });
});
