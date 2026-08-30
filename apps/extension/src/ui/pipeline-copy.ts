/**
 * Human labels for the trust-loop rail.
 * OWNS: Display names only. Pipeline IDs and stage semantics stay unchanged.
 */

import type { PipelineId } from '../runtime/ui-snapshot.js';

const RAIL: Record<PipelineId, string> = {
  SEE: 'Look',
  PERCEIVE: 'Read',
  PROTECT: 'Protect',
  THINK: 'Ask',
  VALIDATE: 'Check',
  ACT: 'Do',
  VERIFY: 'Prove',
};

const HELP: Record<PipelineId, string> = {
  SEE: 'Looking at this page',
  PERCEIVE: 'Understanding what matters',
  PROTECT: 'Protecting your information',
  THINK: 'Asking AI for the next step',
  VALIDATE: 'Checking the proposed action',
  ACT: 'Doing the action',
  VERIFY: 'Making sure it worked',
};

export function pipelineRailLabel(id: PipelineId): string {
  return RAIL[id];
}

export function pipelineStageHelp(id: PipelineId): string {
  return HELP[id];
}
