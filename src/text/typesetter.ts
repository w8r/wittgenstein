/**
 * Typesetting for GPU text: line breaking with pretext, glyphs from
 * runtime-generated MSDF atlases (msdfgen-ts).
 *
 * Fonts are registered as CSS FontFaces from the same TTF files that
 * msdfgen-ts parses, so pretext's canvas measurements and the rendered
 * glyph advances agree.
 *
 * Usage:
 *   1. `Typesetter.load()`
 *   2. `layout()` every text block (records which glyphs are needed)
 *   3. `buildAtlas()` once — generates MSDFs and packs them into one texture
 *   4. `quad()` resolves laid-out glyphs into atlas-space quads
 */
import { Atlas, Font, type AtlasGlyph } from 'msdfgen-ts';
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineItem
} from '@chenglou/pretext/rich-inline';
import type { Script, Token } from './latex';
import type { ProgressCallback } from '../util/yield';
import AtlasWorker from 'msdfgen-ts/worker?worker';
import type { BuildRequest, BuiltResponse, ErrorResponse } from 'msdfgen-ts/worker';

const enum FontIndex {
  Slab = 0,
  SlabBold = 1,
  Serif = 2,
  SerifItalic = 3,
  Symbols = 4
}

/**
 * Prose is set in Roboto Slab (bold for emphasis), TeX math in STIX Two,
 * with Noto Sans Math as the fallback for logic symbols.
 */
const FONT_FILES = [
  { url: 'fonts/RobotoSlab-Regular.ttf', family: 'Tractatus Slab', descriptors: {} },
  {
    url: 'fonts/RobotoSlab-Bold.ttf',
    family: 'Tractatus Slab',
    descriptors: { weight: 'bold' }
  },
  { url: 'fonts/STIXTwoText.ttf', family: 'Tractatus Serif', descriptors: {} },
  {
    url: 'fonts/STIXTwoText-Italic.ttf',
    family: 'Tractatus Serif',
    descriptors: { style: 'italic' }
  },
  { url: 'fonts/NotoSansMath-Regular.ttf', family: 'Tractatus Math', descriptors: {} }
];

/** Font fallback chains, first font with the glyph wins. */
const PROSE_FONTS = [FontIndex.Slab, FontIndex.Serif, FontIndex.Symbols];
const PROSE_EMPHASIS_FONTS = [FontIndex.SlabBold, ...PROSE_FONTS];
const MATH_FONTS = [FontIndex.Serif, FontIndex.Symbols];
const MATH_ITALIC_FONTS = [FontIndex.SerifItalic, ...MATH_FONTS];

/** STIX has a smaller x-height than Roboto Slab; scale math up to match. */
const MATH_SCALE = 1.1;

/** MSDF generation resolution (atlas texels per em) and distance range. */
const ATLAS_PX_PER_EM = 40;
const ATLAS_PX_RANGE = 5;

/** Pretext measures at this multiple of the requested size, for precision. */
const MEASURE_SCALE = 4;

const LINE_HEIGHT_EM = 1.45;
const PARAGRAPH_GAP_EM = 0.5;
const SCRIPT_SCALE = 0.7;
const SUPERSCRIPT_RISE_EM = 0.38;
const SUBSCRIPT_DROP_EM = 0.18;

/** Fallback advances (em) for spaces missing from every font. */
const SPACE_ADVANCE_EM: Record<string, number> = {
  ' ': 0.25,
  ' ': 0.25,
  ' ': 1
};

/** A glyph placed on the pen line, before atlas lookup. */
export interface PlacedGlyph {
  font: FontIndex;
  codepoint: number;
  /** Pen position relative to the text block's top-left corner (y-up). */
  x: number;
  y: number;
  /** Font size (world units per em). */
  size: number;
}

export interface TextBlock {
  glyphs: PlacedGlyph[];
  width: number;
  height: number;
}

/** A glyph quad in world space with its atlas texture rectangle. */
interface GlyphQuad {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  v: number;
  uw: number;
  vh: number;
}

export interface AtlasTexture {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  /** MSDF distance range in atlas texels. */
  pxRange: number;
}

/** One font's generated atlas: texture plus glyphs in codepoint order */
interface FontAtlas {
  width: number;
  height: number;
  texture: Uint8Array;
  glyphs: AtlasGlyph[];
}

export class Typesetter {
  private fonts: Font[];
  private used: Set<number>[];
  private cache: Map<number, AtlasGlyph>[] = [];
  private rowOffsets: number[] = [];
  private texture?: AtlasTexture;

  /** `buffers` are the raw font files, sent to the atlas workers */
  constructor(private buffers: ArrayBuffer[]) {
    this.fonts = buffers.map((buffer) => new Font(buffer));
    this.used = buffers.map(() => new Set<number>());
  }

  /** Fetches the font files, registers them for canvas measurement and parses them. */
  static async load(): Promise<Typesetter> {
    const buffers = await Promise.all(
      FONT_FILES.map(async ({ url }) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load font ${url}`);
        return response.arrayBuffer();
      })
    );
    await Promise.all(
      FONT_FILES.map(async ({ family, descriptors }, i) => {
        const face = new FontFace(family, buffers[i].slice(0), descriptors);
        await face.load();
        document.fonts.add(face);
      })
    );
    return new Typesetter(buffers);
  }

  /**
   * Lays out tokens into lines no wider than `maxWidth` (unbounded if omitted).
   * Coordinates are relative to the block's top-left corner, y-up.
   */
  layout(tokens: Token[], fontSize: number, maxWidth = Infinity): TextBlock {
    const glyphs: PlacedGlyph[] = [];
    const lineHeight = fontSize * LINE_HEIGHT_EM;
    const { ascender, descender, unitsPerEm } = this.fonts[FontIndex.Slab].metrics;
    const halfLeading = (lineHeight - (fontSize * (ascender - descender)) / unitsPerEm) / 2;
    const baselineOffset = halfLeading + (fontSize * ascender) / unitsPerEm;

    let top = 0;
    let width = 0;

    for (const paragraph of splitParagraphs(tokens)) {
      if (paragraph.gapBefore) top += lineHeight * PARAGRAPH_GAP_EM;
      // One atomic pretext item per word, so lines only break between words
      const words = splitWords(paragraph.runs);
      const items: RichInlineItem[] = words.map((word) => {
        const main = dominantPart(word);
        return {
          text: (word.spaceBefore ? ' ' : '') + word.parts.map((p) => p.text).join(''),
          font: cssFont(main.run, runSize(main.run, fontSize) * MEASURE_SCALE),
          break: 'never'
        };
      });
      const prepared = prepareRichInline(items);
      const measureWidth = maxWidth * MEASURE_SCALE;

      let cursor = undefined;
      while (true) {
        const range = layoutNextRichInlineLineRange(prepared, measureWidth, cursor);
        if (range === null) break;
        const line = materializeRichInlineLineRange(prepared, range);
        const baseline = -(top + baselineOffset);
        let x = 0;
        for (const fragment of line.fragments) {
          x += fragment.gapBefore / MEASURE_SCALE;
          for (const { run, text } of words[fragment.itemIndex].parts) {
            const y = baseline + fontSize * scriptShift(run.script);
            x = this.placeRun(text, fontChain(run), x, y, runSize(run, fontSize), glyphs);
          }
        }
        width = Math.max(width, x);
        top += lineHeight;
        cursor = range.end;
      }
    }

    return { glyphs, width, height: top };
  }

  /** Places the glyphs of one text run, returning the pen position after it. */
  private placeRun(
    text: string,
    fonts: FontIndex[],
    x: number,
    y: number,
    size: number,
    out: PlacedGlyph[]
  ): number {
    let prevFont = -1;
    let prevGlyphId = 0;
    for (const char of text) {
      const codepoint = char.codePointAt(0)!;
      const font = this.resolveFont(codepoint, fonts);
      if (font === -1) {
        x += (SPACE_ADVANCE_EM[char] ?? 0.5) * size;
        prevFont = -1;
        continue;
      }
      const f = this.fonts[font];
      const glyphId = f.glyphId(codepoint);
      const em = f.metrics.unitsPerEm;
      if (font === prevFont) x += (f.kerning(prevGlyphId, glyphId) / em) * size;
      if (!/\s/.test(char)) {
        out.push({ font, codepoint, x, y, size });
        this.used[font].add(codepoint);
      }
      x += (f.advance(glyphId) / em) * size;
      prevFont = font;
      prevGlyphId = glyphId;
    }
    return x;
  }

  /** Picks the first font that has a glyph for `codepoint`, or -1. */
  private resolveFont(codepoint: number, fonts: FontIndex[]): FontIndex | -1 {
    for (const font of fonts) {
      if (this.fonts[font].glyphId(codepoint) !== 0) return font;
    }
    return -1;
  }

  /**
   * Generates MSDFs for every glyph used so far and stacks the per-font
   * atlases vertically into a single RGBA texture.
   */
  async buildAtlas(onProgress?: ProgressCallback): Promise<AtlasTexture> {
    const total = this.used.reduce((sum, used) => sum + used.size, 0);
    let done = 0;
    // One worker per font: atlases are generated in parallel, off the main thread
    const atlases = await Promise.all(
      this.fonts.map(async (_, i) => {
        const codepoints = [...this.used[i]];
        const atlas = await this.generateInWorker(i, codepoints).catch((error) => {
          console.warn('Atlas worker failed, generating on the main thread:', error);
          return this.generate(i, codepoints);
        });
        done += codepoints.length;
        onProgress?.(done / Math.max(total, 1));
        this.cache[i] = new Map(codepoints.map((cp, j) => [cp, atlas.glyphs[j]]));
        return atlas;
      })
    );

    let width = 1;
    let height = 0;
    atlases.forEach((atlas, i) => {
      this.rowOffsets[i] = height;
      width = Math.max(width, atlas.width);
      height += atlas.height;
    });

    const data = new Uint8Array(width * Math.max(height, 1) * 4);
    atlases.forEach((atlas, i) => {
      const src = atlas.texture;
      const rowBytes = atlas.width * 4;
      for (let row = 0; row < atlas.height; row++) {
        data.set(
          src.subarray(row * rowBytes, (row + 1) * rowBytes),
          (this.rowOffsets[i] + row) * width * 4
        );
      }
    });

    this.texture = { data, width, height: Math.max(height, 1), pxRange: ATLAS_PX_RANGE };
    return this.texture;
  }

  /** Generates one font's atlas in a msdfgen-ts worker */
  private generateInWorker(font: number, codepoints: number[]): Promise<FontAtlas> {
    if (!codepoints.length) return Promise.resolve(this.generate(font, codepoints));
    return new Promise((resolve, reject) => {
      const worker = new AtlasWorker();
      worker.onmessage = (event: MessageEvent<BuiltResponse | ErrorResponse>) => {
        worker.terminate();
        const message = event.data;
        if (message.type === 'error') {
          reject(new Error(message.message));
          return;
        }
        resolve({
          width: message.width,
          height: message.height,
          texture: new Uint8Array(message.texture),
          // One laid-out glyph per codepoint of the requested text, in order
          glyphs: message.glyphs
        });
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(event);
      };
      const bytes = this.buffers[font].slice(0);
      const request: BuildRequest = {
        type: 'build',
        id: font,
        fontKey: FONT_FILES[font].url,
        font: bytes,
        pixelsPerEm: ATLAS_PX_PER_EM,
        pxrange: ATLAS_PX_RANGE,
        text: String.fromCodePoint(...codepoints)
      };
      worker.postMessage(request, [bytes]);
    });
  }

  /** Generates one font's atlas on the main thread (fallback) */
  private generate(font: number, codepoints: number[]): FontAtlas {
    const atlas = new Atlas(this.fonts[font], {
      pixelsPerEm: ATLAS_PX_PER_EM,
      pxrange: ATLAS_PX_RANGE
    });
    const glyphs = atlas.glyphs(codepoints);
    if (!codepoints.length) return { width: 0, height: 0, texture: new Uint8Array(0), glyphs };
    return { width: atlas.width, height: atlas.height, texture: atlas.texture, glyphs };
  }

  /**
   * Resolves a placed glyph to a world-space quad offset by (`originX`,
   * `originY`). Returns null for glyphs without an outline.
   */
  quad(glyph: PlacedGlyph, originX: number, originY: number): GlyphQuad | null {
    const texture = this.texture;
    const g = this.cache[glyph.font]?.get(glyph.codepoint);
    if (!texture || !g || g.w === 0) return null;
    const { size } = glyph;
    // Inset quad and texture rect by half a texel so linear filtering never
    // samples the neighbouring glyph in the packed atlas
    const inset = (0.5 / ATLAS_PX_PER_EM) * size;
    return {
      x: originX + glyph.x + g.planeLeft * size + inset,
      y: originY + glyph.y + g.planeBottom * size + inset,
      w: (g.planeRight - g.planeLeft) * size - 2 * inset,
      h: (g.planeTop - g.planeBottom) * size - 2 * inset,
      u: (g.x + 0.5) / texture.width,
      v: (g.y + this.rowOffsets[glyph.font] + 0.5) / texture.height,
      uw: (g.w - 1) / texture.width,
      vh: (g.h - 1) / texture.height
    };
  }
}

interface Run {
  text: string;
  italic: boolean;
  script: Script;
  math: boolean;
}

/** Splits tokens at forced breaks into runs per line-broken paragraph. */
function splitParagraphs(tokens: Token[]): { runs: Run[]; gapBefore: boolean }[] {
  const paragraphs: { runs: Run[]; gapBefore: boolean }[] = [];
  let current: { runs: Run[]; gapBefore: boolean } = { runs: [], gapBefore: false };
  for (const token of tokens) {
    if (token.type === 'text') {
      current.runs.push(token);
    } else {
      if (current.runs.length) paragraphs.push(current);
      current = { runs: [], gapBefore: token.type === 'par' };
    }
  }
  if (current.runs.length) paragraphs.push(current);
  return paragraphs;
}

/** A word: text between break opportunities, possibly in several styles. */
interface Word {
  parts: { run: Run; text: string }[];
  spaceBefore: boolean;
}

/**
 * Splits styled runs into words. Words break at spaces, and after hyphens
 * and dashes in prose. Non-breaking spaces (inside inline formulas) don't
 * split words, so formulas stay on one line unless wider than the line.
 */
function splitWords(runs: Run[]): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  let spaceBefore = false;
  for (const run of runs) {
    const pieces = run.math ? run.text.split(/( +)/) : run.text.split(/( +)|(?<=[-–—])/);
    for (const piece of pieces) {
      if (!piece) continue;
      if (piece.startsWith(' ')) {
        current = null;
        spaceBefore = true;
        continue;
      }
      if (!current || /[-–—]$/.test(current.parts[current.parts.length - 1].text)) {
        current = { parts: [], spaceBefore };
        words.push(current);
        spaceBefore = false;
      }
      current.parts.push({ run, text: piece });
    }
  }
  return words;
}

/** The part with the most characters, whose font measures the whole word. */
function dominantPart(word: Word) {
  return word.parts.reduce((a, b) => (b.text.length > a.text.length ? b : a));
}

function fontChain(run: Run): FontIndex[] {
  if (run.math) return run.italic ? MATH_ITALIC_FONTS : MATH_FONTS;
  return run.italic ? PROSE_EMPHASIS_FONTS : PROSE_FONTS;
}

/** CSS font shorthand matching `fontChain`, for pretext's canvas measurement. */
function cssFont(run: Run, px: number) {
  if (run.math) {
    return `${run.italic ? 'italic ' : ''}${px}px "Tractatus Serif", "Tractatus Math"`;
  }
  return `${run.italic ? 'bold ' : ''}${px}px "Tractatus Slab", "Tractatus Serif", "Tractatus Math"`;
}

function runSize(run: Run, fontSize: number) {
  return fontSize * (run.script === 0 ? 1 : SCRIPT_SCALE) * (run.math ? MATH_SCALE : 1);
}

function scriptShift(script: Script) {
  return script === 1 ? SUPERSCRIPT_RISE_EM : script === -1 ? -SUBSCRIPT_DROP_EM : 0;
}
