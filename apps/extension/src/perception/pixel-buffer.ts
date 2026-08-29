/**
 * PixelBuffer (Zone 3 local).
 * OWNS: A single ROI raster for the duration of local OCR.
 * LIFECYCLE: CAPTURE → PROCESS → EXTRACT TEXT → RELEASE.
 * MUST NEVER: persist to chrome.storage, disk, logs, telemetry, or TaskState.
 */
export class PixelBuffer {
  readonly roiId: string;
  readonly width: number;
  readonly height: number;
  private data: Uint8ClampedArray | null;
  private releasedAt: number | null = null;

  constructor(roiId: string, width: number, height: number, data: Uint8ClampedArray) {
    this.roiId = roiId;
    this.width = width;
    this.height = height;
    this.data = data;
  }

  public get pixelCount(): number {
    return this.width * this.height;
  }

  public get released(): boolean {
    return this.data === null;
  }

  public bytes(): Uint8ClampedArray {
    if (!this.data) {
      throw new Error(`PixelBuffer ${this.roiId} has been released.`);
    }
    return this.data;
  }

  /**
   * Zero and drop the raster. TRUST: leftover RGBA must not survive in application state.
   */
  public release(): void {
    if (this.data) {
      this.data.fill(0);
      this.data = null;
    }
    this.releasedAt = Date.now();
  }
}
