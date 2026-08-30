/**
 * T019 performance / resource bench (happy-dom unless noted).
 * OWNS: Stage timings with N, p50, p95. Weak CPU/GPU numbers are not invented.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Window as HappyDomWindow } from 'happy-dom';
import { createActionId, createPageEpoch, createTaskId, type ElementId, type RawScene } from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { detectElementPrivacy, detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { summarizeSamples } from './metrics.js';

export interface PerformanceBenchResult {
  classification: 'RESULT';
  runtime: string;
  stages: {
    observation: ReturnType<typeof summarizeSamples>;
    privacyDetection: ReturnType<typeof summarizeSamples>;
    sanitizationAndSafeContext: ReturnType<typeof summarizeSamples>;
    mockPlanner: ReturnType<typeof summarizeSamples>;
    validation: ReturnType<typeof summarizeSamples>;
    executionTypeText: ReturnType<typeof summarizeSamples>;
    verification: ReturnType<typeof summarizeSamples>;
  };
  payload: {
    safeContextBytes: number;
    screenshotOutboundBytes: number;
    observedControls: number;
  };
  resources: {
    distPresent: boolean;
    jsCssBytes: number;
    jsCssGzipBytes: number | null;
    ocrAssetBytes: number;
    files: Array<{ path: string; bytes: number }>;
    memoryProxyBytes: number | null;
    memoryProxyLabel: string;
  };
}

let benchDomInstalled = false;

/**
 * OCR benches must run in the Node vitest environment (happy-dom rewrites the Tesseract worker to http://).
 * Observation/execution timings still need a document. Install one locally; do not change product runtime.
 */
export function ensureBenchDom(url = 'https://lab.example/form'): void {
  if (typeof globalThis.document !== 'undefined' && globalThis.document.body) {
    benchDomInstalled = true;
    return;
  }
  if (benchDomInstalled) return;
  const win = new HappyDomWindow({ url, width: 1280, height: 720 });
  const dest = globalThis as unknown as Record<string, unknown>;
  dest['window'] = win;
  dest['document'] = win.document;
  dest['HTMLElement'] = win.HTMLElement;
  dest['HTMLInputElement'] = win.HTMLInputElement;
  dest['HTMLButtonElement'] = win.HTMLButtonElement;
  dest['HTMLAnchorElement'] = win.HTMLAnchorElement;
  dest['HTMLSelectElement'] = win.HTMLSelectElement;
  dest['HTMLTextAreaElement'] = win.HTMLTextAreaElement;
  dest['HTMLFormElement'] = win.HTMLFormElement;
  dest['HTMLIFrameElement'] = win.HTMLIFrameElement;
  dest['HTMLLabelElement'] = win.HTMLLabelElement;
  dest['HTMLCanvasElement'] = win.HTMLCanvasElement;
  dest['HTMLImageElement'] = win.HTMLImageElement;
  dest['Node'] = win.Node;
  dest['Element'] = win.Element;
  dest['Document'] = win.Document;
  dest['Event'] = win.Event;
  dest['MouseEvent'] = win.MouseEvent;
  dest['KeyboardEvent'] = win.KeyboardEvent;
  dest['InputEvent'] = win.InputEvent;
  dest['MutationObserver'] = win.MutationObserver;
  benchDomInstalled = true;
}

function installForm(count: number): void {
  ensureBenchDom();
  document.body.innerHTML = `<form id="f">${Array.from({ length: count }, (_, i) => `
    <label for="i${i}">Field ${i}</label>
    <input id="i${i}" type="${i % 7 === 0 ? 'email' : i % 11 === 0 ? 'password' : 'text'}" />
    <button type="button" id="b${i}">Go ${i}</button>
  `).join('')}<input id="search" type="search" aria-label="Search" /></form>`;
}

function time(n: number, fn: () => void): number[] {
  const samples: number[] = [];
  for (let i = 0; i < Math.min(3, n); i++) fn();
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return samples;
}

function walkSizes(dir: string, acc: Array<{ path: string; bytes: number }>, prefix = ''): void {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'ocr') {
        walkSizes(full, acc, rel);
        continue;
      }
      if (name === 'assets' || name === 'src' || name === 'overlay' || name === 'sidepanel' || name === 'background') {
        walkSizes(full, acc, rel);
        continue;
      }
      continue;
    }
    acc.push({ path: rel, bytes: st.size });
  }
}

export async function runPerformanceBench(distDir?: string): Promise<PerformanceBenchResult> {
  installForm(40);
  const registry = new ElementRegistry();
  const epoch = createPageEpoch(1);
  const observeMs = time(40, () => {
    registry.clear();
    observePage(registry, epoch);
  });

  const scene = observePage(new ElementRegistry(), createPageEpoch(1));
  const privacyMs = time(40, () => {
    const findings = [...scene.elements.flatMap((e) => detectElementPrivacy(e)), ...detectGoalPrivacy('Continue')];
    evaluatePrivacyPolicy(findings);
  });

  const protectMs = time(20, () => {
    resetTokenCounters();
    const findings = scene.elements.flatMap((e) => detectElementPrivacy(e));
    const decisions = evaluatePrivacyPolicy(findings);
    const vault = new PrivateTokenVault();
    const taskId = createTaskId('perf');
    const safe = buildSafeContext(scene, 'Continue', decisions, vault, taskId, findings);
    validateSafeContextEgress(safe);
  });

  resetTokenCounters();
  const findings = scene.elements.flatMap((e) => detectElementPrivacy(e));
  const decisions = evaluatePrivacyPolicy(findings);
  const vault = new PrivateTokenVault();
  const taskId = createTaskId('perf-plan');
  const safe = buildSafeContext(scene, 'Type hello in the search box', decisions, vault, taskId, findings);
  const serialized = validateSafeContextEgress(safe);
  const planner = new DeterministicPlanner();
  const planMs: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    await planner.proposeAction(safe);
    planMs.push(performance.now() - t0);
  }
  const planned = await planner.proposeAction(safe);
  const validateMs = time(20, () => {
    try {
      validateActionProposal(planned.proposal, scene, vault, taskId, scene.origin);
    } catch {
      // ASK_USER / COMPLETE have no target; still time the call.
    }
  });

  const search = document.getElementById('search');
  const execMs: number[] = [];
  const verifyMs: number[] = [];
  if (search) {
    const target = scene.elements.find((e) => e.inputType === 'search') || scene.elements[0];
    if (target) {
      const proposal = {
        actionId: createActionId('act_perf'),
        type: 'TYPE_TEXT' as const,
        targetId: target.id,
        textValue: 'hello',
        reasoning: 'perf',
        expectedOutcome: 'typed',
        riskLevel: 'LOW' as const,
      };
      let validated;
      try {
        validated = validateActionProposal(proposal, scene, vault, taskId, scene.origin);
      } catch {
        validated = null;
      }
      if (validated) {
        const registry2 = new ElementRegistry();
        const live = observePage(registry2, createPageEpoch(1));
        const targetId = validated.targetElementId as ElementId | undefined;
        const node = targetId ? registry2.getLiveNode(targetId) : null;
        if (node) {
          for (let i = 0; i < 15; i++) {
            const t0 = performance.now();
            executeValidatedAction(validated, registry2);
            execMs.push(performance.now() - t0);
            const t1 = performance.now();
            const post = observePage(new ElementRegistry(), createPageEpoch(2));
            verifyActionExecution(validated, live, post, { fieldState: 'MATCHED' });
            verifyMs.push(performance.now() - t1);
          }
        }
      }
    }
  }

  const assets: Array<{ path: string; bytes: number }> = [];
  if (distDir) walkSizes(distDir, assets);
  const jsCss = assets.filter(
    (a) => /\.(js|css)$/.test(a.path) && !a.path.includes('ocr/') && !a.path.endsWith('.map')
  );
  const ocrAssets = assets.filter((a) => a.path.includes('ocr/'));
  let jsCssGzipBytes: number | null = null;
  if (distDir && jsCss.length > 0) {
    const chunks = jsCss.map((a) => readFileSync(join(distDir, a.path)));
    jsCssGzipBytes = gzipSync(Buffer.concat(chunks)).length;
  }

  return {
    classification: 'RESULT',
    runtime: 'happy-dom',
    stages: {
      observation: summarizeSamples(observeMs),
      privacyDetection: summarizeSamples(privacyMs),
      sanitizationAndSafeContext: summarizeSamples(protectMs),
      mockPlanner: summarizeSamples(planMs),
      validation: summarizeSamples(validateMs),
      executionTypeText: summarizeSamples(execMs),
      verification: summarizeSamples(verifyMs),
    },
    payload: {
      safeContextBytes: serialized.length,
      screenshotOutboundBytes: 0,
      observedControls: scene.elements.length,
    },
    resources: {
      distPresent: Boolean(distDir),
      jsCssBytes: jsCss.reduce((s, a) => s + a.bytes, 0),
      jsCssGzipBytes,
      ocrAssetBytes: ocrAssets.reduce((s, a) => s + a.bytes, 0),
      files: assets,
      memoryProxyBytes: typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : null,
      memoryProxyLabel: 'PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS',
    },
  };
}

export function rawSceneSerializedSize(scene: RawScene): number {
  return JSON.stringify(scene).length;
}
