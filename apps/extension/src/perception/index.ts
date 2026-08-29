export { decidePerception, isDomSufficient } from './adaptive-controller.js';
export { runPerception, type PerceptionCaptureFn } from './orchestrator.js';
export { PixelBuffer } from './pixel-buffer.js';
export { MockOcrEngine } from './mock-engine.js';
export { TesseractOcrEngine } from './tesseract-engine.js';
export { groundAndFuse, applyFusionLabels, isVisualEvidenceStale } from './grounding.js';
export { collectVisualRegions, collectClickableVisualSurfaces } from './visual-regions.js';
export { captureRoisInPage, wireRoisToBuffers, discardWireRois } from './capture.js';
export {
  assertRoiBounds,
  fitRoiToBounds,
  MAX_SIMULTANEOUS_ROIS,
  MAX_ROI_PIXELS,
  MAX_ROI_WIDTH_PX,
  MAX_ROI_HEIGHT_PX,
  MIN_ROI_SIDE_PX,
} from './roi.js';
export type { OcrEngine } from './ocr-engine.js';
