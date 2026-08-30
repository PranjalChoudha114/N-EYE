/**
 * Page I/O ports (Zone 2).
 * OWNS: Chrome tab messaging used by the trust loop.
 * WHY: The overlay is a view. Tests inject fakes. Vault never travels these messages.
 */

import type { ExtensionMessage, ExtensionResponse, FrameId, RoiSpec, TargetFingerprint, ValidatedAction } from '@n-eye/protocol';
import type { ExecutionResult } from '../execution/executor.js';
import { discardWireRois, wireRoisToBuffers, type CapturedRoiWire } from '../perception/capture.js';
import type { PixelBuffer } from '../perception/pixel-buffer.js';

export type PortResult<T> = { ok: true; data: T } | { ok: false; lastError: string };

/**
 * Map a Chrome message response to a port result.
 * WHY: Executor failure (SELECT miss, ASK_USER) still returns structured data.
 * Transport `success: false` must not drop `outcome` / field evidence.
 */
export function toPortResult<T>(
  lastErrorMessage: string | undefined,
  response: ExtensionResponse<T> | undefined
): PortResult<T> {
  if (lastErrorMessage) {
    return { ok: false, lastError: lastErrorMessage };
  }
  if (response?.data !== undefined) {
    return { ok: true, data: response.data };
  }
  return { ok: false, lastError: response?.error || 'empty response' };
}

export interface PagePorts {
  send<T>(tabId: number, message: ExtensionMessage): Promise<PortResult<T>>;
  inject(tabId: number): Promise<boolean>;
  captureRois(tabId: number, rois: RoiSpec[]): Promise<PixelBuffer[]>;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function chromePagePorts(): PagePorts {
  return {
    send<T>(tabId: number, message: ExtensionMessage): Promise<PortResult<T>> {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response: ExtensionResponse<T>) => {
          resolve(toPortResult(chrome.runtime.lastError?.message, response));
        });
      });
    },
    async inject(tabId: number): Promise<boolean> {
      try {
        const injectRes: ExtensionResponse = await chrome.runtime.sendMessage({
          type: 'INJECT_CONTENT_SCRIPT',
          tabId,
        });
        return Boolean(injectRes?.success);
      } catch {
        return false;
      }
    },
    async captureRois(tabId: number, rois: RoiSpec[]): Promise<PixelBuffer[]> {
      const wires = await new Promise<CapturedRoiWire[]>((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          {
            type: 'CAPTURE_ROIS_REQUEST',
            rois: rois.map((roi) => ({
              roiId: roi.roiId,
              x: roi.bbox.x,
              y: roi.bbox.y,
              width: roi.bbox.width,
              height: roi.bbox.height,
            })),
          },
          (response: ExtensionResponse<CapturedRoiWire[]>) => {
            if (chrome.runtime.lastError || !response?.success || !response.data) {
              resolve([]);
              return;
            }
            resolve(response.data);
          }
        );
      });
      const buffers = wireRoisToBuffers(wires);
      discardWireRois(wires);
      return buffers;
    },
  };
}

export async function executeOnTab(
  ports: PagePorts,
  tabId: number,
  action: ValidatedAction
): Promise<ExecutionResult> {
  const result = await ports.send<ExecutionResult>(tabId, {
    type: 'EXECUTE_ACTION_REQUEST',
    action,
  });
  if (!result.ok) {
    return { success: false, error: result.lastError };
  }
  return result.data;
}

/**
 * Read live typed-field relation after a fresh observation. Never returns the raw value.
 * PRIVACY: expectedText stays on this device; only FieldValueState comes back.
 */
export async function probeFieldOnTab(
  ports: PagePorts,
  tabId: number,
  fingerprint: TargetFingerprint,
  expectedText: string,
  frameId?: FrameId
): Promise<ExecutionResult> {
  const result = await ports.send<ExecutionResult>(tabId, {
    type: 'PROBE_FIELD_REQUEST',
    fingerprint,
    expectedText,
    frameId,
  });
  if (!result.ok) {
    return { success: false, error: result.lastError, fieldState: 'UNREADABLE' };
  }
  return result.data;
}
