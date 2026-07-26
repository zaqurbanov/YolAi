import 'server-only';
import zlib from 'node:zlib';
import { getDocumentProxy } from 'unpdf';
// unpdf's index entrypoint doesn't re-export pdf.js internals (OPS, the
// operator-list op codes); those only live under the `unpdf/pdfjs` subpath.
import { OPS } from 'unpdf/pdfjs';

export interface ExtractedSignImage {
  code: string;
  kind: 'sign' | 'marking';
  page: number;
  position: number;
  png: Buffer;
  width: number;
  height: number;
}

// ---- dependency-free PNG encoder (zlib only — no sharp/canvas on Vercel) ----
// Ported verbatim from the verified prototype (extract2.mjs). Do not swap
// this for a library: this whole extraction path is deliberately zero-new-deps.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// rgba must be a Buffer of length w*h*4
function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

interface PdfImageObj {
  width: number;
  height: number;
  kind: number; // pdfjs ImageKind: 1=GRAYSCALE_1BPP, 2=RGB_24BPP, 3=RGBA_32BPP
  data: Uint8Array | Uint8ClampedArray;
}

// pdfjs ImageKind: 1=GRAYSCALE_1BPP, 2=RGB_24BPP, 3=RGBA_32BPP — do not
// upscale or resample; the road-sign catalog images are genuinely tiny
// (mostly 50x44px) in the source PDF.
function toRgba(obj: PdfImageObj): Buffer {
  const { width: w, height: h, kind, data } = obj;
  if (kind === 3) return Buffer.from(data.buffer, data.byteOffset, w * h * 4);
  const out = Buffer.alloc(w * h * 4, 255);
  if (kind === 2) {
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      out[i * 4] = data[j];
      out[i * 4 + 1] = data[j + 1];
      out[i * 4 + 2] = data[j + 2];
    }
  } else if (kind === 1) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * w + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = v;
      }
    }
  } else {
    throw new Error(`unsupported pdf image kind ${kind}`);
  }
  return out;
}

// ---- 2D affine matrix helpers (pdf.js CTM convention: [a b c d e f]) ----
type Matrix = [number, number, number, number, number, number];

function mulMatrix(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

interface PageLike {
  objs: { has: (name: string) => boolean; get: (name: string, cb: (obj: unknown) => void) => void };
  commonObjs: { has: (name: string) => boolean; get: (name: string, cb: (obj: unknown) => void) => void };
}

// Image XObjects live in page.objs when page-local, but pdf.js hoists ones
// reused across pages into the document-level commonObjs. Asking the wrong
// store never resolves (its callback simply never fires), so check both,
// and time out rather than hang forever if neither store has it.
function getObj(page: PageLike, name: string): Promise<PdfImageObj | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000);
    const done = (obj: unknown) => {
      clearTimeout(timer);
      resolve(obj as PdfImageObj);
    };
    try {
      if (page.objs.has(name)) {
        page.objs.get(name, done);
        return;
      }
      if (page.commonObjs.has(name)) {
        page.commonObjs.get(name, done);
        return;
      }
      page.objs.get(name, done);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// Must include the hyphenated variants (page 18 has `5.29.1-1`, `5.32-2`) —
// without the trailing `(-\d{1,2})?` group, 24 images end up unmatched.
const CODE_EXACT = /^\d{1,2}\.\d{1,2}(\.\d{1,2})?(-\d{1,2})?$/;

interface PlacedImage {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CodeLabel {
  code: string;
  x: number;
  y: number;
}

export async function extractSignImages(pdfBuffer: ArrayBuffer | Buffer): Promise<ExtractedSignImage[]> {
  const bytes =
    pdfBuffer instanceof ArrayBuffer ? new Uint8Array(pdfBuffer) : new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const pdf = await getDocumentProxy(bytes);

  const results: ExtractedSignImage[] = [];
  const positionByCode = new Map<string, number>();

  // Road-marking catalog pages reuse codes from the sign catalog (1.1-1.24,
  // 2.1-2.7 collide — 23 codes repeat) and aren't reliably reachable by PDF
  // page number. Detect entry into that section by a monotonicity break:
  // the numeric leading component of the code resets back down to 1 after
  // having climbed higher earlier in the document. Everything from that
  // point on is tagged 'marking'; nothing before it is affected.
  let maxLeadingSeen = 0;
  let inMarkingSection = false;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const ops = await page.getOperatorList();

    // Walk the operator list tracking the CTM via a save/restore stack —
    // this is how each image's actual placement (position + size) is
    // recovered. page.objs alone carries pixel data, not placement.
    let ctm: Matrix = IDENTITY;
    const stack: Matrix[] = [];
    const images: PlacedImage[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      if (fn === OPS.save) {
        stack.push(ctm.slice() as Matrix);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() ?? IDENTITY;
      } else if (fn === OPS.transform) {
        ctm = mulMatrix(ctm, args as Matrix);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
        images.push({
          name: args[0] as string,
          x: ctm[4],
          y: ctm[5],
          w: Math.abs(ctm[0]),
          h: Math.abs(ctm[3]),
        });
      }
    }

    const tc = await page.getTextContent();
    const codes: CodeLabel[] = [];
    for (const item of tc.items as Array<{ str?: string; transform: number[] }>) {
      const s = (item.str ?? '').trim();
      if (!CODE_EXACT.test(s)) continue;
      codes.push({ code: s, x: item.transform[4], y: item.transform[5] });
    }

    // Code<->image pairing is coordinate-based, greedy nearest-neighbor,
    // one-to-one — deliberate choice. Pairing by document order (zipping
    // images[i] with codes[i]) drifts by ~9 lines partway through the doc,
    // because text items and image paints aren't emitted in matching order.
    interface Candidate {
      imageIndex: number;
      codeIndex: number;
      dist: number;
    }
    const candidates: Candidate[] = [];
    images.forEach((img, imageIndex) => {
      const cx = img.x + img.w / 2;
      const cy = img.y + img.h / 2;
      codes.forEach((c, codeIndex) => {
        candidates.push({ imageIndex, codeIndex, dist: Math.hypot(c.x - cx, c.y - cy) });
      });
    });
    candidates.sort((a, b) => a.dist - b.dist);

    const usedImage = new Set<number>();
    const usedCode = new Set<number>();
    const pairs: Array<{ image: PlacedImage; code: string; imageIndex: number }> = [];
    for (const { imageIndex, codeIndex } of candidates) {
      if (usedImage.has(imageIndex) || usedCode.has(codeIndex)) continue;
      usedImage.add(imageIndex);
      usedCode.add(codeIndex);
      pairs.push({ image: images[imageIndex], code: codes[codeIndex].code, imageIndex });
    }
    pairs.sort((a, b) => a.imageIndex - b.imageIndex);

    for (const pair of pairs) {
      const leading = Number.parseInt(pair.code.split('.')[0] ?? '0', 10);
      if (!inMarkingSection && leading < maxLeadingSeen) {
        inMarkingSection = true;
      }
      if (leading > maxLeadingSeen) maxLeadingSeen = leading;

      const kind: ExtractedSignImage['kind'] = inMarkingSection ? 'marking' : 'sign';

      const obj = await getObj(page, pair.image.name);
      if (!obj) continue; // object never resolved within the timeout — skip rather than block ingestion

      const png = encodePng(obj.width, obj.height, toRgba(obj));
      const position = positionByCode.get(pair.code) ?? 0;
      positionByCode.set(pair.code, position + 1);

      results.push({
        code: pair.code,
        kind,
        page: p,
        position,
        png,
        width: obj.width,
        height: obj.height,
      });
    }
  }

  return results;
}
