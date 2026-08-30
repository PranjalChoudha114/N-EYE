/**
 * Original N-Eye glyphs. Familiar sun/moon semantics, not a copy of any vendor icon.
 */

function svg(viewBox: string, children: SVGElement[]): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('width', '16');
  node.setAttribute('height', '16');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  for (const child of children) node.appendChild(child);
  return node;
}

function line(x1: string, y1: string, x2: string, y2: string): SVGLineElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  node.setAttribute('x1', x1);
  node.setAttribute('y1', y1);
  node.setAttribute('x2', x2);
  node.setAttribute('y2', y2);
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.6');
  node.setAttribute('stroke-linecap', 'round');
  return node;
}

function circle(cx: string, cy: string, r: string, fill = 'none'): SVGCircleElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  node.setAttribute('cx', cx);
  node.setAttribute('cy', cy);
  node.setAttribute('r', r);
  node.setAttribute('fill', fill);
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.6');
  return node;
}

function path(d: string, fill = 'none'): SVGPathElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', d);
  node.setAttribute('fill', fill);
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.6');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  return node;
}

export function iconSun(): SVGSVGElement {
  return svg('0 0 16 16', [
    circle('8', '8', '3.1'),
    line('8', '1.8', '8', '3.4'),
    line('8', '12.6', '8', '14.2'),
    line('1.8', '8', '3.4', '8'),
    line('12.6', '8', '14.2', '8'),
  ]);
}

export function iconMoon(): SVGSVGElement {
  return svg('0 0 16 16', [
    path('M11.4 10.6A4.6 4.6 0 1 1 7.2 3.2 3.6 3.6 0 1 0 11.4 10.6Z', 'currentColor'),
  ]);
}

export function iconSystem(): SVGSVGElement {
  return svg('0 0 16 16', [
    circle('8', '8', '6.2'),
    path('M8 2v12A6.2 6.2 0 0 0 8 2Z', 'currentColor'),
  ]);
}

export function iconChevron(): SVGSVGElement {
  return svg('0 0 16 16', [path('M4 6.5 8 10.5 12 6.5')]);
}

export function iconClose(): SVGSVGElement {
  return svg('0 0 16 16', [line('4', '4', '12', '12'), line('12', '4', '4', '12')]);
}

/** Trust-loop Look — original ellipse/pupil, not a vendor glyph. */
export function iconLook(): SVGSVGElement {
  return svg('0 0 16 16', [
    path('M2 8c2.2-3.4 4.4-4.6 6-4.6S11.8 4.6 14 8c-2.2 3.4-4.4 4.6-6 4.6S4.2 11.4 2 8Z'),
    circle('8', '8', '2.1'),
  ]);
}

export function iconRead(): SVGSVGElement {
  return svg('0 0 16 16', [
    path('M3.5 3.2h6.2L12.5 6v6.8H3.5Z'),
    line('6', '8', '10', '8'),
    line('6', '10.2', '9.2', '10.2'),
  ]);
}

export function iconProtect(): SVGSVGElement {
  return svg('0 0 16 16', [path('M8 2.4 13.2 4.4v4.2c0 3-2.1 4.8-5.2 5.8-3.1-1-5.2-2.8-5.2-5.8V4.4Z')]);
}

export function iconAsk(): SVGSVGElement {
  return svg('0 0 16 16', [
    path('M3.2 3.4h9.6v7.2H7.1L3.2 13.4Z'),
  ]);
}

export function iconCheck(): SVGSVGElement {
  return svg('0 0 16 16', [
    circle('8', '8', '5.4'),
    path('M5.4 8.1 7.2 9.9 10.7 6.2'),
  ]);
}

export function iconDo(): SVGSVGElement {
  return svg('0 0 16 16', [path('M5.2 3.6v8.8L12.6 8Z', 'currentColor')]);
}

export function iconProve(): SVGSVGElement {
  return svg('0 0 16 16', [
    circle('8', '8', '6.1'),
    path('M5.1 8.2 7.2 10.3 11.1 5.8'),
  ]);
}

export function iconClock(): SVGSVGElement {
  return svg('0 0 16 16', [circle('8', '8', '6.1'), line('8', '8', '8', '4.8'), line('8', '8', '11', '9.4')]);
}

export function replaceIcon(el: HTMLElement, icon: SVGSVGElement): void {
  el.replaceChildren(icon);
}
