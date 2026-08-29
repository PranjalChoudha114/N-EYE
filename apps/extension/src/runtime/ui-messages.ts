/**
 * Extension-internal UI bus (Zone 2).
 * OWNS: Overlay ↔ service worker ↔ Side Panel commands.
 * MUST NOT: Carry vault realValue, RawScene, or raw secrets.
 * WHY: Kept out of @n-eye/protocol so the planner/privacy contracts stay frozen.
 */

import type { PlannerMode } from '../planner/types.js';
import type { ThemePref } from '../ui/theme.js';
import type { ProductState } from './ui-snapshot.js';

export const OVERLAY_HOST_ID = 'n-eye-overlay-host';

export type NEyeUiCommand =
  | { type: 'N_EYE_UI_COMMAND'; command: 'run'; goal: string }
  | { type: 'N_EYE_UI_COMMAND'; command: 'cancel' }
  | { type: 'N_EYE_UI_COMMAND'; command: 'setMode'; mode: PlannerMode }
  | { type: 'N_EYE_UI_COMMAND'; command: 'setGoal'; goal: string }
  | { type: 'N_EYE_UI_COMMAND'; command: 'confirm'; approved: boolean }
  | { type: 'N_EYE_UI_COMMAND'; command: 'openPanel' }
  | { type: 'N_EYE_UI_COMMAND'; command: 'setTheme'; pref: ThemePref }
  | { type: 'N_EYE_UI_COMMAND'; command: 'closeOverlay' };

export type NEyeOverlayMessage =
  | { type: 'N_EYE_TOGGLE_OVERLAY' }
  | { type: 'N_EYE_UNMOUNT_OVERLAY' }
  | { type: 'N_EYE_OVERLAY_STATE'; state: ProductState; themePref: ThemePref }
  | { type: 'N_EYE_OVERLAY_CLOSED' }
  | NEyeUiCommand;

export function isNeyeOverlayMessage(value: unknown): value is NEyeOverlayMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const type = (value as { type: unknown }).type;
  return (
    type === 'N_EYE_TOGGLE_OVERLAY' ||
    type === 'N_EYE_UNMOUNT_OVERLAY' ||
    type === 'N_EYE_OVERLAY_STATE' ||
    type === 'N_EYE_OVERLAY_CLOSED' ||
    type === 'N_EYE_UI_COMMAND'
  );
}
