/**
 * Side Panel owner host (Zone 2/3).
 * OWNS: TrustLoopController, vault, OCR. The overlay is a view of this document.
 * TRUST: Closing this panel stops an in-flight task (same as T011/T012).
 * MUST NOT: Put vault values into ProductState or overlay broadcasts.
 */

import type { ExtensionMessage, TabInfo } from '@n-eye/protocol';
import { PlannerManager } from '../planner/planner-manager.js';
import { TesseractOcrEngine } from '../perception/tesseract-engine.js';
import { chromePagePorts } from '../runtime/page-ports.js';
import { TrustLoopController } from '../runtime/trust-loop.js';
import type { ProductState } from '../runtime/ui-snapshot.js';
import type { NEyeUiCommand } from '../runtime/ui-messages.js';
import { mountProductShell } from '../ui/shell.js';
import { bindProductUi } from '../ui/render.js';
import {
  applyThemeToDocument,
  nextThemePref,
  persistThemePref,
  readThemePref,
  type ThemePref,
} from '../ui/theme.js';

interface UiHello {
  type: 'UI_HELLO';
  tabInfo: TabInfo | null;
  state: ProductState | null;
  themePref: ThemePref;
}

const els = mountProductShell(document);
const ui = bindProductUi(els);
ui.setDetailsOpen(true);
els.detailsBtn.classList.add('hidden');
els.viewHint.classList.add('hidden');

let themePref: ThemePref = readThemePref();
applyThemeToDocument(themePref);

try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (themePref === 'system') applyThemeToDocument(themePref);
  });
} catch {
  // Theme already applied.
}

const planner = new PlannerManager('MOCK', 'http://localhost:8000');
const controller = new TrustLoopController({
  ports: chromePagePorts(),
  planner,
  ocr: new TesseractOcrEngine(),
});

const port = chrome.runtime.connect({ name: 'n-eye-owner' });

function paint(state: ProductState): void {
  ui.update(state, { role: 'owner', themePref });
  port.postMessage({ type: 'UI_STATE', state });
}

function applyCommand(msg: NEyeUiCommand): void {
  if (msg.command === 'run') {
    controller.setGoal(msg.goal);
    void controller.start(msg.goal);
    return;
  }
  if (msg.command === 'cancel') {
    controller.cancel();
    return;
  }
  if (msg.command === 'setMode') {
    controller.setMode(msg.mode);
    return;
  }
  if (msg.command === 'setGoal') {
    controller.setGoal(msg.goal);
    return;
  }
  if (msg.command === 'confirm') {
    controller.confirm(msg.approved, msg.confirmationId);
    return;
  }
  if (msg.command === 'setTheme') {
    themePref = msg.pref;
    persistThemePref(themePref);
    applyThemeToDocument(themePref);
    port.postMessage({ type: 'UI_THEME', pref: themePref });
    paint(controller.getState());
  }
}

port.onMessage.addListener((msg: UiHello | NEyeUiCommand) => {
  if (msg.type === 'UI_HELLO') {
    themePref = msg.themePref || themePref;
    applyThemeToDocument(themePref);
    if (msg.state && msg.tabInfo && msg.state.tabId === msg.tabInfo.tabId) {
      controller.hydrate(msg.state);
    }
    if (msg.tabInfo) {
      controller.bindTab(msg.tabInfo);
      if (!controller.getState().running) {
        void controller.idleObserve();
      }
    }
    return;
  }
  if (msg.type === 'N_EYE_UI_COMMAND') {
    applyCommand(msg);
  }
});

controller.subscribe((state) => {
  paint(state);
});

els.themeToggle.addEventListener('click', () => {
  themePref = nextThemePref(themePref);
  persistThemePref(themePref);
  applyThemeToDocument(themePref);
  port.postMessage({ type: 'UI_THEME', pref: themePref });
  paint(controller.getState());
});

els.run.addEventListener('click', () => {
  controller.setGoal(els.goal.value);
  void controller.start(els.goal.value);
});

els.goal.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (controller.getState().running) return;
  controller.setGoal(els.goal.value);
  void controller.start(els.goal.value);
});

els.cancel.addEventListener('click', () => {
  controller.cancel();
});

els.modeMock.addEventListener('click', () => {
  controller.setMode('MOCK');
});

els.modeRemote.addEventListener('click', () => {
  controller.setMode('REMOTE');
});

els.confirmOk.addEventListener('click', () => {
  controller.confirm(true, controller.getState().confirmation?.confirmationId);
});

els.confirmCancel.addEventListener('click', () => {
  controller.confirm(false, controller.getState().confirmation?.confirmationId);
});

els.goal.addEventListener('change', () => {
  controller.setGoal(els.goal.value);
});

window.addEventListener('beforeunload', () => {
  controller.cancel();
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== 'TAB_CHANGED') return;
  controller.bindTab(message.tabInfo);
  if (!controller.getState().running) {
    void controller.idleObserve();
  }
});
