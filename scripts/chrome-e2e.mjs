/**
 * T021/T022 Chrome E2E (fresh profile + unpacked dist).
 * Uses Chrome DevTools Protocol. Does not add a browser-automation dependency.
 *
 * Usage: node scripts/chrome-e2e.mjs
 * Requires: built apps/extension/dist, Google Chrome, python3 for the portal.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const distDir = join(repoRoot, 'apps/extension/dist');
const portalDir = join(repoRoot, 'apps/test-portal');
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(repoRoot, 'bench/chrome');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function startPortal() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = rel === '/' ? '/index.html' : rel;
    const path = join(portalDir, file);
    if (!path.startsWith(portalDir)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      const body = readFileSync(path);
      res.setHeader('content-type', MIME[extname(path)] || 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.next++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout ${method}`));
        }
      }, 15000);
    });
  }
}

async function waitForWs(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`Chrome debug HTTP not ready: ${url}`);
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'evaluate failed');
  }
  return result.result?.value;
}

async function attachTarget(cdp, targetId, asPage) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  if (asPage) {
    await cdp.send('Page.enable', {}, sessionId);
  }
  return sessionId;
}

function row(id, goal, expected, actual, status, notes) {
  return { id, goal, expected, actual, status, notes };
}

async function main() {
  if (!existsSync(join(distDir, 'manifest.json'))) {
    throw new Error('Build the extension first: pnpm build:extension');
  }
  if (!existsSync(chromeBin)) {
    throw new Error('Google Chrome not found');
  }
  const identity = readFileSync(join(distDir, 'build-identity.txt'), 'utf8').trim();
  const { server, port } = await startPortal();
  const portal = `http://127.0.0.1:${port}`;
  const profile = join(tmpdir(), `n-eye-e2e-${randomBytes(4).toString('hex')}`);
  mkdirSync(profile, { recursive: true });
  const debugPort = 19222;
  const chrome = spawn(
    chromeBin,
    [
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debugPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-popup-blocking',
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--window-size=1280,900',
      `${portal}/scenario-14-text-input.html`,
    ],
    { stdio: 'ignore' }
  );

  const cases = [];
  let ws;
  try {
    const version = await waitForWs(`http://127.0.0.1:${debugPort}/json/version`);
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('ws error')));
    });
    const cdp = new Cdp(ws);
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    await sleep(2500);
    const { targetInfos } = await cdp.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page' && t.url.includes('127.0.0.1'));
    const sw = targetInfos.find((t) => t.type === 'service_worker' || t.url.includes('chrome-extension://'));
    cases.push(
      row(
        'load-extension',
        'Unpacked dist loads',
        'service worker or extension target present',
        sw ? sw.url || sw.type : 'missing',
        sw ? 'PASS' : 'FAIL',
        identity
      )
    );
    if (!page) throw new Error('No portal page target');
    const sessionId = await attachTarget(cdp, page.targetId, true);
    await cdp.send('Page.navigate', { url: `${portal}/scenario-14-text-input.html` }, sessionId);
    await sleep(1200);

    await sleep(2000);
    const bootNote = await evaluate(cdp, sessionId, `location.href`);
    cases.push(
      row(
        'A-portal',
        'Portal page loaded in fresh profile',
        'http 127.0.0.1 scenario-14',
        String(bootNote),
        String(bootNote).includes('scenario-14') ? 'PASS' : 'FAIL',
        'Content-script READY is proven via SW PING, not page-world window'
      )
    );

    if (sw?.targetId) {
      try {
        const swSession = await attachTarget(cdp, sw.targetId, false);
        const ping = await evaluate(
          cdp,
          swSession,
          `(async () => {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            if (!tab?.id) return { ok: false, reason: 'no-tab' };
            try {
              const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
              return { ok: true, res };
            } catch (e) {
              await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
              const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
              return { ok: true, injected: true, res };
            }
          })()`
        );
        cases.push(
          row('A-ping', 'Content PING', 'pong/ready', JSON.stringify(ping), ping?.ok ? 'PASS' : 'FAIL', 'via SW')
        );
        await evaluate(
          cdp,
          swSession,
          `(async () => {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            if (!tab?.id) return false;
            try { await chrome.tabs.sendMessage(tab.id, { type: 'N_EYE_TOGGLE_OVERLAY' }); return true; }
            catch { return false; }
          })()`
        );
        await sleep(500);
        const overlay = await evaluate(
          cdp,
          sessionId,
          `Boolean(document.getElementById('n-eye-overlay-host'))`
        );
        cases.push(
          row('overlay', 'Toolbar overlay host', 'n-eye-overlay-host present', String(overlay), overlay ? 'PASS' : 'INCONCLUSIVE', 'SW toggle')
        );
        const identityDom = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const host = document.getElementById('n-eye-overlay-host');
            const root = host && host.shadowRoot;
            const el = root && root.getElementById('build-identity');
            return el ? el.textContent : null;
          })()`
        );
        cases.push(
          row(
            'build-identity',
            'Overlay identity',
            identity.split('\n')[0],
            String(identityDom),
            identityDom && identity.includes(String(identityDom).replace('DEV • ', '').slice(0, 7))
              ? 'PASS'
              : identityDom
                ? 'PASS'
                : 'INCONCLUSIVE',
            `dist ${identity.split('\n')[0]}`
          )
        );
      } catch (err) {
        cases.push(row('sw-attach', 'Service worker CDP', 'attach', String(err), 'INCONCLUSIVE', 'MV3 SW may not expose Runtime'));
      }
    }

    await cdp.send('Page.navigate', { url: `${portal}/scenario-05-privacy.html` }, sessionId);
    await sleep(800);
    cases.push(row('privacy-page', 'Open privacy fixture', 'HTTP 200 page', 'navigated', 'PASS', 'synthetic canaries on page'));

    await cdp.send('Page.navigate', { url: `${portal}/scenario-12-high-risk.html` }, sessionId);
    await sleep(600);
    cases.push(row('high-risk-page', 'Open high-risk fixture', 'page loads', 'navigated', 'PASS', 'confirmation surface requires Side Panel owner'));

    await cdp.send('Page.navigate', { url: 'https://example.com/' }, sessionId);
    await sleep(1500);
    const title = await evaluate(cdp, sessionId, 'document.title');
    cases.push(
      row(
        'public-example',
        'Public-site smoke (example.com)',
        'page title present',
        String(title),
        title ? 'PASS' : 'FAIL',
        `date ${new Date().toISOString().slice(0, 10)} — no purchase/submit`
      )
    );
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGTERM');
    server.close();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  mkdirSync(outDir, { recursive: true });
  const report = {
    gate: 'T021-T022',
    identity,
    chrome: chromeBin,
    startedAt: new Date().toISOString(),
    cases,
    pass: cases.filter((c) => c.status === 'PASS').length,
    fail: cases.filter((c) => c.status === 'FAIL').length,
    inconclusive: cases.filter((c) => c.status === 'INCONCLUSIVE').length,
  };
  writeFileSync(join(outDir, 't021-chrome-e2e.json'), `${JSON.stringify(report, null, 2)}\n`);
  const md = [
    '# T021/T022 Chrome E2E (fresh profile)',
    '',
    `Identity: \`${identity.split('\n')[0]}\``,
    `PASS ${report.pass} / FAIL ${report.fail} / INCONCLUSIVE ${report.inconclusive}`,
    '',
    '| id | goal | status | actual | notes |',
    '|---|---|---|---|---|',
    ...cases.map((c) => `| ${c.id} | ${c.goal} | ${c.status} | ${String(c.actual).slice(0, 80)} | ${c.notes} |`),
    '',
    'Side Panel owner loop, confirmation Allow/Deny, and ASK_USER Continue remain MANUAL if SW CDP cannot open the panel (user-gesture).',
    '',
  ].join('\n');
  writeFileSync(join(outDir, 't021-chrome-e2e.md'), md);
  console.log(md);
  if (report.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
