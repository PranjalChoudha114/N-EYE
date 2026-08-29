import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { formatBuildIdentity } from './src/dev/build-identity.ts';

const require = createRequire(import.meta.url);
const repoRoot = resolve(__dirname, '../..');

function readGitBuildIdentity(): { label: string; detail: string } {
  let shortSha = 'unknown';
  let dirty = false;
  try {
    shortSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    dirty = execSync('git status --porcelain --untracked-files=no', { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0;
  } catch {
    // TRUST: identity is developer metadata only; unknown is safer than inventing a SHA.
  }
  return formatBuildIdentity(shortSha, dirty, new Date().toISOString());
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content-script.ts'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  plugins: [
    {
      name: 'copy-manifest-with-build-identity',
      closeBundle() {
        // Recompute on every watch rebuild so dist/manifest.json tracks current HEAD.
        const identity = readGitBuildIdentity();
        if (!existsSync('dist')) {
          mkdirSync('dist', { recursive: true });
        }
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as Record<string, unknown>;
        // Chrome shows version_name on chrome://extensions (stale SW vs current dist).
        manifest.version_name = identity.label;
        writeFileSync('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
        writeFileSync('dist/build-identity.txt', `${identity.label}\n${identity.detail}\n`);

        const ocrDir = join('dist', 'ocr');
        mkdirSync(ocrDir, { recursive: true });
        const workerSrc = require.resolve('tesseract.js/dist/worker.min.js');
        cpSync(workerSrc, join(ocrDir, 'worker.min.js'));
        const coreRoot = dirname(require.resolve('tesseract.js-core/package.json'));
        cpSync(join(coreRoot, 'tesseract-core-simd-lstm.wasm.js'), join(ocrDir, 'tesseract-core-simd-lstm.wasm.js'));
        const trained = resolve(__dirname, 'ocr-assets/eng.traineddata');
        if (existsSync(trained)) {
          cpSync(trained, join(ocrDir, 'eng.traineddata'));
        }
      },
    },
  ],
});
