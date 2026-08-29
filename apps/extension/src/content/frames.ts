import {
  createFrameId,
  TOP_FRAME_ID,
  type BoundingBox,
  type FrameId,
  type FrameKind,
  type FrameProvenance,
} from '@n-eye/protocol';

const MAX_FRAMES = 8;
const MAX_DEPTH = 3;

export interface DiscoveredFrame {
  frameId: FrameId;
  frameKind: FrameKind;
  depth: number;
  sameOriginAsTop: boolean;
  iframe: HTMLIFrameElement | null;
  document: Document | null;
  offset: BoundingBox;
  reason?: 'cross-origin' | 'sandbox' | 'detached';
}

function originOf(doc: Document): string {
  try {
    return doc.defaultView?.location.origin || '';
  } catch {
    return '';
  }
}

function offsetBox(iframe: HTMLIFrameElement, parentOffset: BoundingBox): BoundingBox {
  const rect = iframe.getBoundingClientRect();
  return {
    x: parentOffset.x + rect.x,
    y: parentOffset.y + rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function trySameOriginDocument(iframe: HTMLIFrameElement): {
  document: Document | null;
  reason?: 'cross-origin' | 'sandbox' | 'detached';
} {
  if (!iframe.isConnected) {
    return { document: null, reason: 'detached' };
  }
  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      return { document: null, reason: iframe.hasAttribute('sandbox') ? 'sandbox' : 'cross-origin' };
    }
    void doc.documentElement;
    return { document: doc };
  } catch {
    return { document: null, reason: 'cross-origin' };
  }
}

/**
 * Frame discovery (Zone 1).
 * OWNS: Distinguishing top document from same-origin accessible frames.
 * MUST NOT: Set all_frames, expand host permissions, or tunnel into cross-origin documents.
 * PRIVACY: Returns opaque frameIds only. Never stores iframe src query strings.
 */
export function discoverFrames(topDocument: Document = document): DiscoveredFrame[] {
  const topOrigin = originOf(topDocument);
  const topFrame: DiscoveredFrame = {
    frameId: TOP_FRAME_ID,
    frameKind: 'top',
    depth: 0,
    sameOriginAsTop: true,
    iframe: null,
    document: topDocument,
    offset: { x: 0, y: 0, width: 0, height: 0 },
  };
  const frames: DiscoveredFrame[] = [topFrame];

  const queue: DiscoveredFrame[] = [topFrame];
  let nestedIndex = 1;

  while (queue.length > 0 && frames.length < MAX_FRAMES) {
    const parent = queue.shift();
    if (!parent?.document || parent.depth >= MAX_DEPTH) continue;

    const iframes = parent.document.querySelectorAll('iframe');
    for (const node of iframes) {
      if (frames.length >= MAX_FRAMES) break;
      if (!(node instanceof HTMLIFrameElement)) continue;
      const access = trySameOriginDocument(node);
      const offset = offsetBox(node, parent.offset);
      if (!access.document) {
        frames.push({
          frameId: createFrameId(`f${nestedIndex++}`),
          frameKind: 'inaccessible',
          depth: parent.depth + 1,
          sameOriginAsTop: false,
          iframe: node,
          document: null,
          offset,
          reason: access.reason,
        });
        continue;
      }
      const childOrigin = originOf(access.document);
      const child: DiscoveredFrame = {
        frameId: createFrameId(`f${nestedIndex++}`),
        frameKind: 'same-origin',
        depth: parent.depth + 1,
        sameOriginAsTop: Boolean(topOrigin) && childOrigin === topOrigin,
        iframe: node,
        document: access.document,
        offset,
      };
      frames.push(child);
      queue.push(child);
    }
  }

  return frames;
}

export function provenanceOf(frame: DiscoveredFrame): FrameProvenance {
  return {
    frameId: frame.frameId,
    frameKind: frame.frameKind,
    depth: frame.depth,
    sameOriginAsTop: frame.sameOriginAsTop,
  };
}

export function shiftBoxToTopViewport(local: BoundingBox, frameOffset: BoundingBox): BoundingBox {
  return {
    x: Math.round(local.x + frameOffset.x),
    y: Math.round(local.y + frameOffset.y),
    width: Math.round(local.width),
    height: Math.round(local.height),
  };
}

export function frameIdPrefix(frameId: FrameId): string {
  return frameId === TOP_FRAME_ID ? 'e' : `${frameId}e`;
}

export function ownerFrameId(node: Node, frames: DiscoveredFrame[]): FrameId {
  const doc = node.ownerDocument;
  const match = frames.find((frame) => frame.document === doc);
  return match?.frameId ?? TOP_FRAME_ID;
}
