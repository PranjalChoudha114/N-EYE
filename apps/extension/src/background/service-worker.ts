import {
  type ExtensionMessage,
  type ExtensionResponse,
  type TaskState,
  createTaskId,
} from '@n-eye/protocol';

let currentTaskState: TaskState = {
  taskId: createTaskId('task-init'),
  goal: '',
  status: 'IDLE',
};

// Enable side panel on extension action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[N-Eye SW] Failed to set panel behavior:', error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('[N-Eye SW] N-Eye Extension initialized (Manifest V3)');
});

// Central message router
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    console.log('[N-Eye SW] Received message:', message.type, 'from:', sender.tab ? `tab ${sender.tab.id}` : 'extension UI');

    if (message.type === 'PING') {
      sendResponse({ success: true, data: { pong: true, timestamp: Date.now() } });
      return true;
    }

    if (message.type === 'GET_STATE') {
      sendResponse({ success: true, data: currentTaskState });
      return true;
    }

    if (message.type === 'START_TASK') {
      currentTaskState = {
        taskId: createTaskId(`task-${Date.now()}`),
        goal: message.goal,
        status: 'OBSERVING',
      };

      // Broadcast state update to side panel
      chrome.runtime.sendMessage({
        type: 'STATE_UPDATED',
        state: currentTaskState,
      }).catch(() => {
        // Sidepanel might not be open
      });

      sendResponse({ success: true, data: currentTaskState });
      return true;
    }

    if (message.type === 'CANCEL_TASK') {
      currentTaskState = {
        ...currentTaskState,
        status: 'CANCELLED',
      };
      sendResponse({ success: true, data: currentTaskState });
      return true;
    }

    // Default unhandled
    sendResponse({ success: false, error: `Unhandled message type: ${(message as { type: string }).type}` });
    return true;
  }
);
