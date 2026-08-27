import type {
  ExtensionMessage,
  ExtensionResponse,
  RawScene,
  TabInfo,
  TaskState,
} from '@n-eye/protocol';

// DOM Elements
const statusPill = document.getElementById('status-pill') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const siteOrigin = document.getElementById('site-origin') as HTMLElement;
const unsupportedBanner = document.getElementById('unsupported-banner') as HTMLElement;
const unsupportedReason = document.getElementById('unsupported-reason') as HTMLElement;
const btnReobserve = document.getElementById('btn-reobserve') as HTMLButtonElement;
const pageTitle = document.getElementById('page-title') as HTMLElement;
const pageEpoch = document.getElementById('page-epoch') as HTMLElement;
const controlsCount = document.getElementById('controls-count') as HTMLElement;
const latencyVal = document.getElementById('latency-val') as HTMLElement;
const privacySummary = document.getElementById('privacy-summary') as HTMLElement;
const controlsContainer = document.getElementById('controls-container') as HTMLElement;

// Evidence Elements
const evidenceRegistrySize = document.getElementById('evidence-registry-size') as HTMLElement;
const evidenceFpCount = document.getElementById('evidence-fp-count') as HTMLElement;
const evidenceViewport = document.getElementById('evidence-viewport') as HTMLElement;
const evidenceRaw = document.getElementById('evidence-raw') as HTMLElement;

interface PanelState {
  status: 'BOOTING' | 'CONNECTING' | 'OBSERVING' | 'READY' | 'UNSUPPORTED' | 'FAILED';
  tabInfo: TabInfo | null;
  scene: RawScene | null;
  error: string | null;
}

const state: PanelState = {
  status: 'BOOTING',
  tabInfo: null,
  scene: null,
  error: null,
};

function renderStatus(): void {
  statusText.textContent = state.status;
  statusPill.className = `status-pill status-${state.status.toLowerCase()}`;

  if (state.tabInfo) {
    siteOrigin.textContent = state.tabInfo.title
      ? `${state.tabInfo.title} (${state.tabInfo.origin})`
      : state.tabInfo.origin || 'Active Webpage';
    pageTitle.textContent = state.tabInfo.title || 'Untitled';
  } else {
    siteOrigin.textContent = 'No active webpage';
    pageTitle.textContent = '—';
  }

  if (state.status === 'UNSUPPORTED') {
    unsupportedBanner.style.display = 'flex';
    unsupportedReason.textContent =
      state.tabInfo?.unsupportedReason ||
      'N-Eye cannot inspect this browser page (internal or protected URL).';
    btnReobserve.disabled = true;
    controlsContainer.innerHTML = '<div class="empty-state">Observation disabled on protected page.</div>';
    privacySummary.innerHTML = '<span class="muted">Protection not applicable.</span>';
    return;
  }

  unsupportedBanner.style.display = 'none';
  btnReobserve.disabled = state.status === 'OBSERVING';
}

function renderScene(scene: RawScene): void {
  pageEpoch.textContent = `Epoch ${scene.pageEpoch}`;
  controlsCount.textContent = scene.elements.length.toString();
  latencyVal.textContent = scene.observationDurationMs !== undefined ? `${scene.observationDurationMs} ms` : '< 5 ms';

  // Render Privacy Findings
  if (scene.privacyFindings.length === 0) {
    privacySummary.innerHTML = '<span class="muted">No sensitive inputs detected on this page.</span>';
  } else {
    privacySummary.innerHTML = scene.privacyFindings
      .map((finding) => {
        const isSecret = finding.privacyClass.startsWith('SECRET');
        const badgeClass = isSecret ? 'badge-secret' : 'badge-pii';
        return `
          <div class="privacy-item">
            <span><strong>[${finding.elementId || 'PAGE'}]</strong> ${finding.reason}</span>
            <span class="${badgeClass}">${finding.privacyClass}</span>
          </div>
        `;
      })
      .join('');
  }

  // Render Controls List
  if (scene.elements.length === 0) {
    controlsContainer.innerHTML = '<div class="empty-state">No interactable controls detected.</div>';
  } else {
    controlsContainer.innerHTML = scene.elements
      .map((el) => {
        const typeInfo = el.inputType ? ` (${el.inputType})` : '';
        const label = el.innerTextCandidate || el.ariaLabel || el.role || el.tagName;
        return `
          <div class="control-item">
            <div class="control-left">
              <span class="control-id">${el.id}</span>
              <span class="control-label" title="${label}">${label}${typeInfo}</span>
            </div>
            <span class="control-tag">${el.role || el.tagName}</span>
          </div>
        `;
      })
      .join('');
  }

  // Render Forensic Evidence
  evidenceRegistrySize.textContent = scene.elements.length.toString();
  evidenceFpCount.textContent = scene.elements.filter((e) => e.fingerprint).length.toString();
  evidenceViewport.textContent = `${scene.viewport.width} × ${scene.viewport.height} px`;

  const safeEvidenceDump = {
    url: scene.url,
    origin: scene.origin,
    pageEpoch: scene.pageEpoch,
    observationDurationMs: scene.observationDurationMs,
    elementCount: scene.elements.length,
    elementsSample: scene.elements.slice(0, 5).map((e) => ({
      id: e.id,
      role: e.role,
      tagName: e.tagName,
      labelCandidate: e.innerTextCandidate,
      inputType: e.inputType,
      fingerprintDigest: e.fingerprint?.digest,
    })),
    privacyFindingsCount: scene.privacyFindings.length,
  };
  evidenceRaw.textContent = JSON.stringify(safeEvidenceDump, null, 2);
}

async function requestObservation(tabId: number): Promise<void> {
  state.status = 'OBSERVING';
  renderStatus();

  try {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'OBSERVE_REQUEST' },
      (response: ExtensionResponse<RawScene>) => {
        if (chrome.runtime.lastError) {
          console.warn('[N-Eye Panel] Content script communication error:', chrome.runtime.lastError.message);
          state.status = 'FAILED';
          state.error = chrome.runtime.lastError.message || 'Content script unavailable';
          controlsContainer.innerHTML = `<div class="empty-state" style="color: var(--accent-rose)">Content script not connected.<br><small>Reload the tab or check page permissions.</small></div>`;
          renderStatus();
          return;
        }

        if (!response || !response.success || !response.data) {
          state.status = 'FAILED';
          state.error = response?.error || 'Unknown observation error';
          controlsContainer.innerHTML = `<div class="empty-state" style="color: var(--accent-rose)">Observation failed: ${state.error}</div>`;
          renderStatus();
          return;
        }

        state.scene = response.data;
        state.status = 'READY';
        renderStatus();
        renderScene(state.scene);
      }
    );
  } catch (err) {
    state.status = 'FAILED';
    state.error = (err as Error).message;
    renderStatus();
  }
}

async function initializeActiveTab(): Promise<void> {
  state.status = 'CONNECTING';
  renderStatus();

  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' }, (response: ExtensionResponse<TabInfo>) => {
    if (chrome.runtime.lastError || !response || !response.success || !response.data) {
      state.status = 'FAILED';
      state.error = 'Failed to obtain active tab info';
      renderStatus();
      return;
    }

    const tabInfo = response.data;
    state.tabInfo = tabInfo;

    if (!tabInfo.isSupported) {
      state.status = 'UNSUPPORTED';
      renderStatus();
      return;
    }

    requestObservation(tabInfo.tabId);
  });
}

// Event Listeners
btnReobserve.addEventListener('click', () => {
  if (state.tabInfo && state.tabInfo.isSupported) {
    requestObservation(state.tabInfo.tabId);
  } else {
    initializeActiveTab();
  }
});

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'TAB_CHANGED') {
    state.tabInfo = message.tabInfo;
    if (!message.tabInfo.isSupported) {
      state.status = 'UNSUPPORTED';
      renderStatus();
    } else {
      requestObservation(message.tabInfo.tabId);
    }
  }

  if (message.type === 'STATE_UPDATED') {
    const taskState: TaskState = message.state;
    if (taskState.activeTab) {
      state.tabInfo = taskState.activeTab;
    }
  }
});

// Bootstrap immediately
initializeActiveTab();
