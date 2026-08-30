import type { PrivacyFinding, SafeContext } from '@n-eye/protocol';

/**
 * Privacy Transformation Visualizer model (Zone 2 UI).
 * OWNS: What the Side Panel may show as CURRENT EVENT evidence.
 * MUST NOT: Invent demo emails/passwords. Empty until a real N-Eye protect step ran.
 */

export type VisualizerMode = 'empty' | 'live';

export interface VisualizerItem {
  tag: string;
  value: string;
  kind: 'local' | 'token' | 'blocked' | 'empty';
}

export interface VisualizerModel {
  mode: VisualizerMode;
  caption: string;
  local: VisualizerItem[];
  safe: VisualizerItem[];
}

export const EMPTY_VISUALIZER_CAPTION = 'No N-Eye privacy transformation has occurred for this task.';

export function emptyVisualizerModel(): VisualizerModel {
  return {
    mode: 'empty',
    caption: EMPTY_VISUALIZER_CAPTION,
    local: [{ tag: 'NONE', value: EMPTY_VISUALIZER_CAPTION, kind: 'empty' }],
    safe: [{ tag: 'NONE', value: 'No protected AI context was built for a request.', kind: 'empty' }],
  };
}

export function visualizerModel(
  findings: PrivacyFinding[] | null,
  safeContext: SafeContext | null
): VisualizerModel {
  if (!findings || !safeContext) {
    return emptyVisualizerModel();
  }

  const local: VisualizerItem[] = [];
  if (findings.length === 0) {
    local.push({ tag: 'PUBLIC', value: 'No personal details in this task', kind: 'local' });
  } else {
    for (const finding of findings.slice(0, 4)) {
      const isSecret = finding.privacyClass.startsWith('SECRET_');
      local.push({
        tag: finding.privacyClass.replace('SECRET_', '').replace('PII_', ''),
        value: isSecret ? '••••••••' : finding.textSpan || finding.reason,
        kind: 'local',
      });
    }
  }

  const safe: VisualizerItem[] = [];
  for (const token of safeContext.availableTokens) {
    safe.push({
      tag: token.tokenSymbol,
      value: `Hidden from the AI as ${token.tokenSymbol}`,
      kind: 'token',
    });
  }
  if (findings.some((f) => f.privacyClass.startsWith('SECRET_'))) {
    safe.push({ tag: 'SECRETS', value: 'Not sent to the AI', kind: 'blocked' });
  }
  if (safe.length === 0) {
    safe.push({ tag: 'CLEAN', value: 'No hidden or blocked values in this task', kind: 'empty' });
  }

  return {
    mode: 'live',
    caption: 'What N-Eye protected in this request (not an example).',
    local,
    safe,
  };
}

export function modelContainsExamplePlaceholder(model: VisualizerModel): boolean {
  if (model.mode !== 'empty') return false;
  const blob = JSON.stringify(model);
  return blob.includes('user@example.com') || blob.includes('[EMAIL_1]');
}
