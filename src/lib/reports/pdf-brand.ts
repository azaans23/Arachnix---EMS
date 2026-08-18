import type { jsPDF } from 'jspdf';

/**
 * Print-side mirror of the light theme tokens in globals.css.
 * PDFs always render on white paper, so only the light palette is used.
 */
export const PDF_THEME = {
  ink: [10, 10, 10] as RGB,
  inkSoft: [38, 38, 38] as RGB,
  muted: [107, 107, 112] as RGB,
  border: [230, 230, 233] as RGB,
  canvas: [247, 247, 248] as RGB,
  surface: [255, 255, 255] as RGB,
  danger: [180, 35, 24] as RGB,
  success: [6, 118, 71] as RGB,
};

export type RGB = [number, number, number];

/** Arachnix mark — path data mirrored from public/brand/logo-mark.svg. */
const MARK_VIEWBOX = { width: 266, height: 381 };
const MARK_PATHS = [
  'M193.363 381L266 260.427L234.942 253.791L251.222 209.594L229.055 209.093L211.147 160.639L243.458 153.752L170.821 33.1795L213.276 146.115L207.891 151.749L180.589 77.6274L201.003 196.447L180.965 210.721L205.386 210.22L223.044 222.74L202.506 341.56L231.31 263.432L235.818 268.065L193.363 381Z',
  'M60.9897 150.747L56.4812 146.115L98.936 33.1795L26.2995 153.752L57.3578 160.388L41.3277 203.96L14.1516 204.586L32.3108 253.541L0 260.427L72.6366 381L30.1818 268.065L35.5669 262.431L62.8682 336.552L42.3296 217.732L60.2383 205.086L89.4181 205.713L69.2552 191.439L89.7938 72.6192L60.9897 150.747Z',
  'M175.83 317.897V256.671L134.878 225.996L93.9265 256.671V317.897L134.878 348.447L175.83 317.897Z',
  'M155.543 112.059L134.879 99.5383L114.215 112.059V77.0014L134.879 64.4808L155.543 77.0014V112.059Z',
  'M153.664 165.897L134.879 154.378L116.093 165.897V133.594L134.879 122.075L153.664 133.594V165.897Z',
  'M151.786 215.98L134.879 205.462L117.972 215.98V186.431L134.879 175.914L151.786 186.431V215.98Z',
  'M107.828 25.1664L124.985 50.3327H142.769L125.486 25.1664L142.769 0H126.112L107.828 25.1664Z',
  'M142.768 0V35.809L155.542 54.4646V17.4038L142.768 0Z',
];

/** Arachnix wordmark — path data mirrored from public/brand/wordmark.svg. */
const WORDMARK_VIEWBOX = { width: 318.888, height: 43.2397 };
const WORDMARK_PATHS = [
  'M31.6661 25.0531V20.3459H18.4862C9.75659 20.3459 8.34446 22.2716 7.74537 25.0531H31.6661ZM38.9836 13.2852V43.2397H31.6661V31.643H7.27465V43.2397H0V28.2197C0 18.8482 5.43459 13.2852 14.9344 13.2852H38.9836Z',
  'M55.2503 31.643V24.9247H72.2815C75.2342 24.9247 76.9031 23.2986 77.331 20.3459H51.8697V43.2397H44.595V13.2852H84.3917V19.0194C84.3917 26.5936 80.7116 30.7444 73.3513 31.5147L84.734 43.2397H75.9188L64.365 31.643H55.2503Z',
  'M119.34 25.0531V20.3459H106.16C97.4302 20.3459 96.0181 22.2716 95.419 25.0531H119.34ZM126.657 13.2852V43.2397H119.34V31.643H94.9483V43.2397H87.6736V28.2197C87.6736 18.8482 93.1082 13.2852 102.608 13.2852H126.657Z',
  'M169.369 36.1362V43.2397H131.969V28.2197C131.969 18.8482 137.404 13.2852 146.946 13.2852H169.369V20.3459H147.075C141.854 20.3459 139.244 22.999 139.244 28.3481V36.1362H169.369Z',
  'M211.801 13.2852V43.2397H204.527V31.6858H181.291V43.2397H174.016V13.2852H181.291V24.9247H204.527V13.2852H211.801Z',
  'M257.96 13.2852V43.2397H250.257C242.041 32.0282 234.125 24.7107 226.337 21.7581C225.78 21.5869 225.096 21.2874 224.368 21.0306C224.454 22.1004 224.497 22.8279 224.497 23.1274V43.2397H217.393V13.2852H223.684C233.269 16.3663 242.17 23.2986 249.658 31.4291L250.985 32.8412C250.899 31.9426 250.857 31.3007 250.857 30.8728V13.2852H257.96Z',
  'M270.887 13.2852V43.2397H263.612V13.2852H270.887Z',
  'M301.514 28.0913L318.888 43.2397H308.661L296.85 32.2849L284.483 43.2397H274.384L291.672 28.3909L261.013 0H261.405L296.508 24.1544L308.618 13.2852H318.888L301.514 28.0913Z',
];

/** jsPDF leg: [dx, dy] line, or [dx1, dy1, dx2, dy2, dx3, dy3] cubic bezier. */
type Leg = number[];
type SubPath = { start: [number, number]; legs: Leg[] };

const TOKEN = /([MmLlHhVvCcZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

/**
 * Minimal SVG path reader for the brand assets (M/L/H/V/C/Z only).
 * jsPDF expects deltas from the current point, which is exactly how SVG
 * relative commands work, so absolute coordinates are converted to deltas.
 */
function toSubPaths(d: string): SubPath[] {
  const tokens: Array<string | number> = [];
  for (const match of d.matchAll(TOKEN)) {
    tokens.push(match[1] ? match[1] : Number(match[2]));
  }

  const subPaths: SubPath[] = [];
  let current: SubPath | null = null;
  let command = '';
  let x = 0;
  let y = 0;
  let index = 0;

  const num = () => {
    const value = tokens[index];
    index += 1;
    return typeof value === 'number' ? value : 0;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (typeof token === 'string') {
      command = token;
      index += 1;
      if (command === 'Z' || command === 'z') {
        current = null;
        continue;
      }
    }

    switch (command) {
      case 'M':
      case 'm': {
        const nx = command === 'M' ? num() : x + num();
        const ny = command === 'M' ? num() : y + num();
        x = nx;
        y = ny;
        current = { start: [x, y], legs: [] };
        subPaths.push(current);
        // Implicit line-to for repeated coordinate pairs.
        command = command === 'M' ? 'L' : 'l';
        break;
      }
      case 'L':
      case 'l': {
        const nx = command === 'L' ? num() : x + num();
        const ny = command === 'L' ? num() : y + num();
        current?.legs.push([nx - x, ny - y]);
        x = nx;
        y = ny;
        break;
      }
      case 'H':
      case 'h': {
        const nx = command === 'H' ? num() : x + num();
        current?.legs.push([nx - x, 0]);
        x = nx;
        break;
      }
      case 'V':
      case 'v': {
        const ny = command === 'V' ? num() : y + num();
        current?.legs.push([0, ny - y]);
        y = ny;
        break;
      }
      case 'C':
      case 'c': {
        const relative = command === 'c';
        const x1 = relative ? num() : num() - x;
        const y1 = relative ? num() : num() - y;
        const x2 = relative ? num() : num() - x;
        const y2 = relative ? num() : num() - y;
        const x3 = relative ? num() : num() - x;
        const y3 = relative ? num() : num() - y;
        current?.legs.push([x1, y1, x2, y2, x3, y3]);
        x += x3;
        y += y3;
        break;
      }
      default:
        index += 1;
        break;
    }
  }

  return subPaths.filter((subPath) => subPath.legs.length > 0);
}

function drawPaths(
  doc: jsPDF,
  paths: string[],
  viewBox: { width: number; height: number },
  options: { x: number; y: number; height: number; color: RGB }
) {
  const scale = options.height / viewBox.height;
  doc.setFillColor(options.color[0], options.color[1], options.color[2]);

  for (const path of paths) {
    const subPaths = toSubPaths(path);
    subPaths.forEach((subPath, index) => {
      // Sub-paths of one glyph must share a single fill so counters (the holes
      // in A/R) are punched out by the nonzero winding rule, as in the SVG.
      const style = index === subPaths.length - 1 ? 'F' : null;
      doc.lines(
        subPath.legs,
        options.x + subPath.start[0] * scale,
        options.y + subPath.start[1] * scale,
        [scale, scale],
        style,
        true
      );
    });
  }
}

/** Width the mark occupies for a given height. */
export function markWidth(height: number) {
  return (height * MARK_VIEWBOX.width) / MARK_VIEWBOX.height;
}

/** Width the wordmark occupies for a given height. */
export function wordmarkWidth(height: number) {
  return (height * WORDMARK_VIEWBOX.width) / WORDMARK_VIEWBOX.height;
}

export function drawBrandMark(
  doc: jsPDF,
  options: { x: number; y: number; height: number; color?: RGB }
) {
  drawPaths(doc, MARK_PATHS, MARK_VIEWBOX, {
    x: options.x,
    y: options.y,
    height: options.height,
    color: options.color ?? PDF_THEME.ink,
  });
}

export function drawBrandWordmark(
  doc: jsPDF,
  options: { x: number; y: number; height: number; color?: RGB }
) {
  drawPaths(doc, WORDMARK_PATHS, WORDMARK_VIEWBOX, {
    x: options.x,
    y: options.y,
    height: options.height,
    color: options.color ?? PDF_THEME.ink,
  });
}
