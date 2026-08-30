/**
 * T019/T020 benchmark I/O (evaluation only).
 * OWNS: Manifest capture and machine-readable report writes.
 * MUST NEVER: Invent metrics, persist secrets, or mix T009/T010 report filenames.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, homedir, release, totalmem, type } from 'node:os';
import { dirname, join } from 'node:path';

export const BENCH_SCHEMA = 'n-eye-bench/1';

export interface BenchManifest {
  schemaVersion: typeof BENCH_SCHEMA;
  gate: 'T019-T020';
  gitSha: string;
  gitShaShort: string;
  dirty: boolean;
  dirtySummary: string[];
  timestamp: string;
  os: string;
  arch: string;
  cpu: string;
  ramBytes: number;
  node: string;
  pnpm: string | null;
  python: string | null;
  browser: string;
  ocrEngine: string;
  providerMode: string;
  notes: string[];
}

function run(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function captureManifest(repoRoot: string): BenchManifest {
  const sha = run('git rev-parse HEAD', repoRoot) || 'UNKNOWN';
  const dirtyList = (run('git status --porcelain', repoRoot) || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('scratch/'));
  const cpuName =
    cpus()[0]?.model?.trim() ||
    run('sysctl -n machdep.cpu.brand_string', repoRoot) ||
    'unknown';
  return {
    schemaVersion: BENCH_SCHEMA,
    gate: 'T019-T020',
    gitSha: sha,
    gitShaShort: sha.slice(0, 7),
    dirty: dirtyList.length > 0,
    dirtySummary: dirtyList.slice(0, 20),
    timestamp: new Date().toISOString(),
    os: `${type()} ${release()}`,
    arch: process.arch,
    cpu: cpuName,
    ramBytes: totalmem(),
    node: process.version,
    pnpm: run('pnpm -v', repoRoot),
    python: run('python3 --version', repoRoot),
    browser: 'happy-dom (automated) + Chrome unpacked MANUAL for product UI',
    ocrEngine: 'tesseract.js@7',
    providerMode: 'MOCK for task/planner benches; live Gemini not required',
    notes: [
      'No personal device identifiers beyond CPU model / RAM class.',
      `home redacted: ${homedir() ? '[present]' : '[absent]'}`,
      `macOS productVersion: ${run('sw_vers -productVersion', repoRoot) || 'n/a'}`,
      'T009/T010 reports are historical and are not this gate’s RESULT files.',
      'Chrome version is MANUAL / UNVERIFIED in this automated pack.',
    ],
  };
}

/**
 * Unit `pnpm test` must not rewrite evidence files (that dirties SHA identity).
 * `pnpm bench:all` sets N_EYE_BENCH_WRITE=1.
 */
export function shouldWriteBench(): boolean {
  return process.env['N_EYE_BENCH_WRITE'] === '1';
}

export function writeJson(path: string, value: unknown): void {
  if (!shouldWriteBench()) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(path: string, value: string): void {
  if (!shouldWriteBench()) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

export function repoJoin(repoRoot: string, ...parts: string[]): string {
  return join(repoRoot, ...parts);
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(1)}%`;
}

export function ratio(num: number, den: number): string {
  return `${num}/${den}`;
}

export function formatMs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(2);
}
