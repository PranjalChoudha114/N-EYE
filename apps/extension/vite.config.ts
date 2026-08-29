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
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
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
      async closeBundle() {
        // Content scripts are classic scripts. ES `import` of Vite chunks never runs in the page.
        // TRUST: bundle content.js as a self-contained IIFE so observation has a receiver.
        const { build } = await import('vite');
        await build({
          configFile: false,
          root: __dirname,
          publicDir: false,
          logLevel: 'warn',
          build: {
            emptyOutDir: false,
            sourcemap: true,
            lib: {
              entry: resolve(__dirname, 'src/content/content-script.ts'),
              name: 'NEyeContentScript',
              formats: ['iife'],
              fileName: () => 'content.js',
            },
            outDir: resolve(__dirname, 'dist'),
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        });
        const contentJs = readFileSync(join('dist', 'content.js'), 'utf8');
        if (/\bimport\s*\{/.test(contentJs) || /\bfrom\s*['"]\.\//.test(contentJs)) {
          throw new Error(
            'N-Eye content.js must be a self-contained IIFE. ES imports cannot run as MV3 content_scripts.'
          );
        }

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

        const brandDest = join('dist', 'brand');
        mkdirSync(brandDest, { recursive: true });
        for (const file of ['n-eye-mark.png', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png']) {
          cpSync(join('assets/brand', file), join(brandDest, file));
        }
        const themeBootDest = join('dist', 'src', 'ui');
        mkdirSync(themeBootDest, { recursive: true });
        cpSync(resolve(__dirname, 'src/ui/theme-boot.js'), join(themeBootDest, 'theme-boot.js'));

        const overlayDest = join('dist', 'overlay');
        mkdirSync(overlayDest, { recursive: true });
        cpSync(resolve(__dirname, 'src/overlay/open-panel.html'), join(overlayDest, 'open-panel.html'));
        cpSync(resolve(__dirname, 'src/overlay/open-panel.js'), join(overlayDest, 'open-panel.js'));

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
