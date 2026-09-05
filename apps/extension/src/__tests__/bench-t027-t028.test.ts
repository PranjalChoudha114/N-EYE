/**
 * T027/T028 measurement entry. Full OCR/visual runs when N_EYE_BENCH_WRITE=1.
 */
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldWriteBench } from '../eval/bench-io.js';
import { runT027T028Pack, writeT027T028Evidence } from '../eval/t027-t028-bench.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

describe('T027/T028 competition measurement', () => {
  it('measures PII/redaction/report canaries and optionally visual/performance', async () => {
    const includeVisualOcr = shouldWriteBench();
    const pack = await runT027T028Pack({ repoRoot, includeVisualOcr });
    expect(pack.privacy.n).toBeGreaterThan(55);
    expect(pack.privacy.classes.some((c) => c.className === 'PII_ACCOUNT_ID')).toBe(true);
    expect(pack.privacy.sanitization.residualLeak).toBe(0);
    expect(pack.privacy.authNeverSend.residualLeak).toBe(0);
    expect(pack.reportCanaryPass).toBe(true);
    expect(pack.searchAffordance.uniqueHits).toBe(pack.searchAffordance.n);
    expect(pack.canary.channels.every((c) => c.pass)).toBe(true);
    if (includeVisualOcr) {
      expect(pack.visual).toBeTruthy();
      expect(pack.performance).toBeTruthy();
      writeT027T028Evidence(repoRoot, pack);
    }
  });
});
