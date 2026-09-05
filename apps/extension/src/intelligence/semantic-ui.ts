/**
 * Task-conditioned Semantic UI + affordance inference (Zone 3).
 *
 * OWNS: Compact affordance vocabulary and spatial relations over SafeElements.
 * TRUST: Website representation ≠ semantic affordance. Geometry is evidence, not authority.
 * MUST NOT: Build a raw DOM knowledge graph, invent selectors, or treat OCR as meaning.
 */

export const UI_AFFORDANCES = [
  'SEARCH_INPUT',
  'SEARCH_SUBMIT',
  'OPEN_RESOURCE',
  'SUBMIT_FORM',
  'SELECT_OPTION',
  'TYPE_FIELD',
  'CONTINUE',
  'CANCEL',
  'CONFIRM',
  'DELETE',
  'UPLOAD',
  'SEND',
  'SCROLL_REGION',
  'UNKNOWN',
] as const;

export type UiAffordance = (typeof UI_AFFORDANCES)[number];

export type SpatialRelation =
  | 'NEAR'
  | 'LEFT_OF'
  | 'RIGHT_OF'
  | 'ABOVE'
  | 'BELOW'
  | 'ALIGNED_WITH'
  | 'INSIDE'
  | 'VIEWPORT_VISIBLE';

export interface AffordanceEvidence {
  elementId: string;
  affordance: UiAffordance;
  signals: string[];
  confidence: number;
}

export interface SemanticRelation {
  kind: SpatialRelation;
  otherId: string;
}

export interface SemanticUiNode {
  elementId: string;
  affordance: UiAffordance;
  regionHeading?: string;
  relations: SemanticRelation[];
  provenance: string[];
}

export interface SemanticUiGraph {
  nodes: SemanticUiNode[];
}

type GeomEl = {
  id: string;
  role?: string | null;
  inputType?: string | null;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
  formSubmitting?: boolean;
  regionHeading?: string | null;
  isEnabled?: boolean;
  bbox?: { x: number; y: number; width: number; height: number };
};

function labelOf(el: GeomEl): string {
  return `${el.safeLabel || ''} ${el.innerTextCandidate || ''} ${el.ariaLabel || ''}`.trim();
}

/**
 * Search field is a function, not only type=search / role=searchbox.
 * WHY: Modern sites (including combobox mastheads) expose Search as text/combobox + name.
 * MUST NOT: Site hostnames or production CSS ids.
 */
export function isSearchField(el: {
  role?: string | null;
  inputType?: string | null;
  isEnabled?: boolean;
  safeLabel?: string | null;
  innerTextCandidate?: string | null;
  ariaLabel?: string | null;
}): boolean {
  if (el.isEnabled === false) return false;
  const role = (el.role || '').toLowerCase();
  const inputType = el.inputType || '';
  if (inputType === 'search' || role === 'searchbox') return true;
  const hay = `${el.safeLabel || ''} ${el.ariaLabel || ''} ${el.innerTextCandidate || ''}`.toLowerCase();
  const searchNamed =
    /\bsearch\b/.test(hay) || /\b(search_query|searchquery|search-query)\b/.test(hay);
  if (role === 'combobox' && searchNamed) return true;
  if ((inputType === 'text' || role === 'textbox') && searchNamed) return true;
  return false;
}

function isVoiceOrImageSearchLabel(label: string): boolean {
  return /\b(voice|your voice|image|camera|lens|mic|microphone)\b/i.test(label);
}

function center(box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function spatialRelation(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): SpatialRelation[] {
  const ac = center(a);
  const bc = center(b);
  const near =
    Math.abs(ac.x - bc.x) <= Math.max(a.width, b.width) + 96 &&
    Math.abs(ac.y - bc.y) <= Math.max(a.height, b.height) + 24;
  const out: SpatialRelation[] = [];
  if (near) out.push('NEAR');
  if (a.x + a.width <= b.x + 8) out.push('LEFT_OF');
  if (a.x >= b.x + b.width - 8) out.push('RIGHT_OF');
  if (a.y + a.height <= b.y + 8) out.push('ABOVE');
  if (a.y >= b.y + b.height - 8) out.push('BELOW');
  if (Math.abs(ac.y - bc.y) <= 12) out.push('ALIGNED_WITH');
  return out;
}

export function inferAffordance(el: GeomEl, all: GeomEl[]): AffordanceEvidence {
  const role = (el.role || '').toLowerCase();
  const inputType = el.inputType || '';
  const label = labelOf(el);
  const signals: string[] = [];
  let affordance: UiAffordance = 'UNKNOWN';
  let confidence = 0.2;

  if (isSearchField(el)) {
    affordance = 'SEARCH_INPUT';
    signals.push(
      inputType === 'search' || role === 'searchbox' ? 'input_search_or_searchbox' : 'search_named_field'
    );
    confidence = inputType === 'search' || role === 'searchbox' ? 0.95 : 0.88;
  } else if (inputType === 'file' || /\bupload\b/i.test(label)) {
    affordance = 'UPLOAD';
    signals.push('file_or_upload');
    confidence = 0.86;
  } else if (['text', 'textarea', 'email', 'tel', 'number'].includes(inputType) || role === 'textbox') {
    affordance = 'TYPE_FIELD';
    signals.push('text_field');
    confidence = 0.7;
  } else if (inputType === 'select' || role === 'combobox') {
    affordance = 'SELECT_OPTION';
    signals.push('select_or_combobox');
    confidence = 0.85;
  } else if (el.formSubmitting === true || inputType === 'submit') {
    affordance = /\bsearch\b/i.test(label) ? 'SEARCH_SUBMIT' : 'SUBMIT_FORM';
    signals.push(el.formSubmitting ? 'form_submitting' : 'input_submit');
    confidence = 0.8;
  } else if (role === 'button' || inputType === 'button' || role === 'link' || role === 'a') {
    if (isVoiceOrImageSearchLabel(label)) {
      affordance = 'UNKNOWN';
      signals.push('secondary_search_mode');
    } else if (/\bsearch\b/i.test(label) || /^go$/i.test(label)) {
      affordance = 'SEARCH_SUBMIT';
      signals.push('labeled_search_control');
      confidence = 0.86;
    } else if (/^(delete|remove|destroy)$/i.test(label) || /\bdelete\b/i.test(label)) {
      affordance = 'DELETE';
      signals.push('delete_label');
      confidence = 0.86;
    } else if (/^(send|send message)$/i.test(label)) {
      affordance = 'SEND';
      signals.push('send_label');
      confidence = 0.84;
    } else if (/^(continue|next)$/i.test(label) || /\bcontinue\b/i.test(label)) {
      affordance = 'CONTINUE';
      signals.push('continue_label');
      confidence = 0.84;
    } else if (/^(cancel|close)$/i.test(label)) {
      affordance = 'CANCEL';
      signals.push('cancel_label');
      confidence = 0.84;
    } else if (/^(confirm|ok|allow|yes)$/i.test(label)) {
      affordance = 'CONFIRM';
      signals.push('confirm_label');
      confidence = 0.8;
    } else if (role === 'link' || role === 'a') {
      affordance = 'OPEN_RESOURCE';
      signals.push('link_open_resource');
      confidence = 0.75;
    } else {
      const searchFields = all.filter((item) => isSearchField(item) && item.bbox);
      if (
        !label &&
        el.bbox &&
        searchFields.length === 1 &&
        searchFields[0]?.bbox &&
        spatialRelation(el.bbox, searchFields[0].bbox).includes('NEAR')
      ) {
        affordance = 'SEARCH_SUBMIT';
        signals.push('unlabeled_adjacent_search');
        confidence = 0.72;
      } else {
        affordance = 'UNKNOWN';
        signals.push('generic_control');
      }
    }
  }

  if (el.regionHeading) signals.push('region_heading');
  return { elementId: el.id, affordance, signals, confidence };
}

export function buildSemanticUiGraph(elements: GeomEl[]): SemanticUiGraph {
  const nodes: SemanticUiNode[] = elements.map((el) => {
    const inferred = inferAffordance(el, elements);
    const relations: SemanticRelation[] = [];
    if (el.bbox) {
      for (const other of elements) {
        if (other.id === el.id || !other.bbox) continue;
        const kinds = spatialRelation(el.bbox, other.bbox);
        for (const kind of kinds) {
          if (kind === 'NEAR' || kind === 'LEFT_OF' || kind === 'RIGHT_OF' || kind === 'ALIGNED_WITH') {
            relations.push({ kind, otherId: other.id });
          }
        }
      }
    }
    return {
      elementId: el.id,
      affordance: inferred.affordance,
      regionHeading: el.regionHeading || undefined,
      relations: relations.slice(0, 8),
      provenance: inferred.signals,
    };
  });
  return { nodes };
}

export function evidenceConfidence(args: {
  semanticMatch: number;
  candidateMargin: number;
  accessible: boolean;
  regionAssociated: boolean;
  formAssociated: boolean;
  geometry: boolean;
  memoryHint: boolean;
  ambiguous: boolean;
}): number {
  // TRUST: Observable evidence, not model self-score.
  let score = 0.15 + args.semanticMatch * 0.35 + Math.min(0.2, args.candidateMargin);
  if (args.accessible) score += 0.1;
  if (args.regionAssociated) score += 0.08;
  if (args.formAssociated) score += 0.08;
  if (args.geometry) score += 0.06;
  if (args.memoryHint) score += 0.05;
  if (args.ambiguous) score = Math.min(score, 0.45);
  return Math.max(0, Math.min(0.99, Number(score.toFixed(3))));
}
