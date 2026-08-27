import type {
  ExtensionResponse,
  RawScene,
  TaskState,
} from '@n-eye/protocol';

const statusIndicator = document.getElementById('status-indicator') as HTMLElement;
const goalInput = document.getElementById('goal-input') as HTMLInputElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnObserve = document.getElementById('btn-observe') as HTMLButtonElement;
const observationSummary = document.getElementById('observation-summary') as HTMLElement;
const privacyList = document.getElementById('privacy-list') as HTMLElement;
const elementsList = document.getElementById('elements-list') as HTMLElement;

function updateStatus(status: string): void {
  statusIndicator.textContent = status;
  statusIndicator.className = 'status-badge status-' + status.toLowerCase();
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function requestPageObservation(): Promise<void> {
  updateStatus('OBSERVING');
  observationSummary.innerHTML = '<span class="muted">Observing active webpage...</span>';

  const tabId = await getActiveTabId();
  if (!tabId) {
    observationSummary.innerHTML = '<span style="color: var(--accent-red)">No active tab found.</span>';
    updateStatus('IDLE');
    return;
  }

  try {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'OBSERVE_REQUEST' },
      (response: ExtensionResponse<RawScene>) => {
        if (chrome.runtime.lastError) {
          observationSummary.innerHTML = `<span style="color: var(--accent-red)">Content script not connected: ${chrome.runtime.lastError.message}</span>`;
          updateStatus('IDLE');
          return;
        }

        if (!response || !response.success || !response.data) {
          observationSummary.innerHTML = `<span style="color: var(--accent-red)">Observation failed: ${response?.error || 'Unknown error'}</span>`;
          updateStatus('FAILED');
          return;
        }

        renderObservation(response.data);
        updateStatus('IDLE');
      }
    );
  } catch (err) {
    observationSummary.innerHTML = `<span style="color: var(--accent-red)">Error: ${(err as Error).message}</span>`;
    updateStatus('FAILED');
  }
}

function renderObservation(scene: RawScene): void {
  observationSummary.innerHTML = `
    <div><strong>URL:</strong> ${scene.url}</div>
    <div><strong>Title:</strong> ${scene.title || 'Untitled'}</div>
    <div><strong>Epoch:</strong> ${scene.pageEpoch} | <strong>Elements:</strong> ${scene.elements.length}</div>
  `;

  // Render privacy findings
  if (scene.privacyFindings.length === 0) {
    privacyList.innerHTML = '<span class="muted">No sensitive elements detected.</span>';
  } else {
    privacyList.innerHTML = scene.privacyFindings
      .map((finding) => {
        const badgeClass = finding.privacyClass.startsWith('SECRET') ? 'privacy-secret' : 'privacy-pii';
        return `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>[${finding.elementId || 'PAGE'}] ${finding.reason}</span>
            <span class="privacy-badge ${badgeClass}">${finding.privacyClass}</span>
          </div>
        `;
      })
      .join('');
  }

  // Render safe element registry
  if (scene.elements.length === 0) {
    elementsList.innerHTML = '<span class="muted">No interactable elements visible.</span>';
  } else {
    elementsList.innerHTML = scene.elements
      .map((el) => {
        const typeInfo = el.inputType ? ` (${el.inputType})` : '';
        const label = el.innerTextCandidate || el.ariaLabel || el.role || el.tagName;
        return `
          <div class="element-item">
            <span class="element-id">${el.id}</span>
            <span class="element-label" title="${label}">${label}${typeInfo}</span>
            <span>[${el.role || el.tagName}]</span>
          </div>
        `;
      })
      .join('');
  }
}

// Event Listeners
btnObserve.addEventListener('click', () => {
  requestPageObservation();
});

btnStart.addEventListener('click', () => {
  const goal = goalInput.value.trim();
  if (!goal) return;

  chrome.runtime.sendMessage(
    { type: 'START_TASK', goal },
    (response: ExtensionResponse<TaskState>) => {
      if (response && response.success && response.data) {
        updateStatus(response.data.status);
        requestPageObservation();
      }
    }
  );
});

// Fetch current state on startup
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response: ExtensionResponse<TaskState>) => {
  if (response && response.success && response.data) {
    updateStatus(response.data.status);
    if (response.data.goal) {
      goalInput.value = response.data.goal;
    }
  }
});
