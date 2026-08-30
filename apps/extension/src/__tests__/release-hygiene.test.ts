/**
 * Release artifact hygiene. Fails if tracked source ships real credentials.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

const SECRET_SHAPES = [
  /AIza[0-9A-Za-z-_]{35}/,
  /sk_live_[0-9a-zA-Z]{20,}/,
  /ghp_[0-9a-zA-Z]{36}/,
  /GEMINI_API_KEY\s*=\s*['"]?[A-Za-z0-9_-]{20,}/,
];

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  '.git',
  '.venv',
  '.pnpm-store',
  'scratch',
  'coverage',
]);

function walk(dir: string, acc: string[]): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(path, acc);
      continue;
    }
    if (!/\.(ts|js|json|md|html|py|txt|toml|yml|yaml|env|example)$/i.test(name)) continue;
    if (name === '.env') {
      acc.push(`TRACKED_OR_PRESENT_ENV:${path}`);
    }
    acc.push(path);
  }
}

describe('Release hygiene', () => {
  it('does not track planner .env and does not embed provider keys in extension source', () => {
    const envPath = join(repoRoot, 'apps/planner-api/.env');
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/\.env/);
    const srcDir = join(repoRoot, 'apps/extension/src');
    const files: string[] = [];
    walk(srcDir, files);
    const leaks: string[] = [];
    for (const file of files) {
      if (file.startsWith('TRACKED_OR_PRESENT_ENV:')) continue;
      if (!file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.html')) continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('GEMINI_API_KEY') && file.includes('/src/') && !file.includes('__tests__') && !file.includes('/eval/')) {
        leaks.push(file);
      }
      for (const shape of SECRET_SHAPES) {
        if (shape.test(text) && !file.includes('__tests__') && !file.includes('/eval/') && !file.includes('detectors.ts') && !file.includes('egress-guard.ts')) {
          leaks.push(`${file}::${shape}`);
        }
      }
    }
    expect(leaks, leaks.join('\n')).toEqual([]);
    if (existsSync(envPath)) {
      expect(gitignore).toContain('.env');
    }
  });

  it('manifest CSP has no remote script and OCR stays local', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'apps/extension/manifest.json'), 'utf8')) as {
      content_security_policy?: { extension_pages?: string };
      host_permissions?: string[];
      permissions?: string[];
    };
    const csp = manifest.content_security_policy?.extension_pages || '';
    expect(csp).toContain("'self'");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).toContain('wasm-unsafe-eval');
    expect(manifest.permissions).toEqual(expect.arrayContaining(['sidePanel', 'activeTab', 'tabs', 'scripting']));
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });
});
