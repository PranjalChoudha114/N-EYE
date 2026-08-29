export type ModelAdmission = 'ADMITTED' | 'REJECTED' | 'DEFERRED';

/**
 * Visual-model admission (T009/T010).
 * A local ONNX/WebGPU model is justified only if OCR+geometry fails a material SIH visual case
 * that a lightweight model could solve within resource bounds.
 */
export function decideModelAdmission(input: {
  visualOnlyGroundingPassed: boolean;
  canvasCasePassed: boolean;
  iconCasePassed: boolean;
  documentCasePassed: boolean;
  ocrUsefulOnHeldOut: boolean;
  screenshotOutboundBytes: number;
}): { decision: ModelAdmission; rationale: string } {
  if (input.screenshotOutboundBytes !== 0) {
    return { decision: 'DEFERRED', rationale: 'Screenshot egress is non-zero; do not add a model until the privacy path is closed.' };
  }
  const requiredPassed =
    input.visualOnlyGroundingPassed &&
    input.canvasCasePassed &&
    input.iconCasePassed &&
    input.documentCasePassed &&
    input.ocrUsefulOnHeldOut;
  if (requiredPassed) {
    return {
      decision: 'REJECTED',
      rationale:
        'Tesseract.js + deterministic geometry/fusion solved the required visual-only SIH cases. A local VLM/ONNX path is not currently justified.',
    };
  }
  return {
    decision: 'DEFERRED',
    rationale:
      'A required visual case failed the OCR+geometry baseline. Define a smallest held-out experiment before admitting a model.',
  };
}
