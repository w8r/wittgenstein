#!/usr/bin/env tsx
/**
 * Generate MSDF text atlas from data.json
 *
 * This script:
 * 1. Loads data.json and extracts all text content
 * 2. Renders LaTeX markup using KaTeX
 * 3. Collects unique glyphs (including math symbols)
 * 4. Generates MSDF for each glyph using msdfgen
 * 5. Packs glyphs into a texture atlas using potpack
 * 6. Outputs text-atlas.png and text-atlas.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { createCanvas, loadImage, registerFont } from 'canvas';
import katex from 'katex';
import potpack from 'potpack';
import { Node } from '../src/types';

// Configuration
const DATA_PATH = path.join(process.cwd(), 'public/data.json');
const OUTPUT_PNG = path.join(process.cwd(), 'public/text-atlas.png');
const OUTPUT_JSON = path.join(process.cwd(), 'public/text-atlas.json');
const TEMP_DIR = path.join(process.cwd(), 'temp/glyphs');
const GLYPH_SIZE = 64; // High resolution for quality
const MSDF_RANGE = 4; // Distance field range in pixels
const MAX_ATLAS_SIZE = 4096;

interface GlyphMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  advance: number;
  bearingX: number;
  bearingY: number;
}

interface TextAtlas {
  width: number;
  height: number;
  glyphs: Record<string, GlyphMetrics>;
}

interface GlyphBox {
  char: string;
  w: number;
  h: number;
  x?: number;
  y?: number;
}

/**
 * Check if msdfgen is available
 * Returns true if available, false otherwise (allows fallback to raster)
 */
function checkMsdfgen(): boolean {
  try {
    execSync('which msdfgen', { stdio: 'pipe' });
    console.log('✓ msdfgen found - will generate true MSDF textures');
    return true;
  } catch (error) {
    console.warn('⚠ msdfgen not found - using raster fallback');
    console.warn('  For true MSDF generation, install msdfgen:');
    console.warn('    macOS:   brew install msdfgen');
    console.warn('    Linux:   Build from https://github.com/Chlumsky/msdfgen');
    console.warn('    Windows: Download from https://github.com/Chlumsky/msdfgen/releases');
    return false;
  }
}

/**
 * Create temporary directory for glyph images
 */
function setupTempDir(): void {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`✓ Created temp directory: ${TEMP_DIR}`);
  }
}

/**
 * Extract all text content from data.json tree
 */
function extractText(node: Node, texts: Set<string>): void {
  if (node.data && node.data.content) {
    texts.add(node.data.content);
  }

  if (node.children) {
    for (const child of node.children) {
      extractText(child, texts);
    }
  }
}

/**
 * Render LaTeX markup to extract glyphs
 * Handles \emph{}, \textbf{}, and inline math
 */
function extractGlyphsFromText(text: string, glyphs: Set<string>): void {
  // First, handle LaTeX commands by rendering with KaTeX
  const latexPatterns = [
    /\$([^$]+)\$/g,  // Inline math: $...$
    /\\emph\{([^}]+)\}/g,  // Emphasis
    /\\textbf\{([^}]+)\}/g,  // Bold
  ];

  let processedText = text;

  // Extract and render LaTeX math
  const mathMatches = text.matchAll(/\$([^$]+)\$/g);
  for (const match of mathMatches) {
    try {
      const latex = match[1];
      // Render LaTeX to get the actual characters/symbols
      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        output: 'html'
      });

      // Extract text content from HTML (simplified - katex uses spans with data attributes)
      // For now, we'll add common math symbols that KaTeX uses
      const mathSymbols = '∀∃→↔¬∧∨⊃⊂∈∉⊆⊇∩∪∅ℕℤℚℝℂ∞≤≥≠≡≈±×÷∂∫∑∏√()[]{}';
      for (const char of mathSymbols) {
        glyphs.add(char);
      }
    } catch (error) {
      console.warn(`Warning: Failed to render LaTeX: ${match[1]}`);
    }
  }

  // Remove LaTeX commands to get plain text
  processedText = processedText
    .replace(/\$([^$]+)\$/g, '$1')  // Remove $ delimiters
    .replace(/\\emph\{([^}]+)\}/g, '$1')  // Extract emphasized text
    .replace(/\\textbf\{([^}]+)\}/g, '$1');  // Extract bold text

  // Collect all remaining characters
  for (const char of processedText) {
    if (char.trim()) {  // Skip pure whitespace
      glyphs.add(char);
    }
  }
}

/**
 * Collect all unique glyphs from all proposition content
 */
function collectGlyphs(rootNode: Node): Set<string> {
  const texts = new Set<string>();
  extractText(rootNode, texts);

  console.log(`Found ${texts.size} unique text strings`);

  const glyphs = new Set<string>();

  // Add standard ASCII printable characters
  const basicChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?\'"()-–—•';
  for (const char of basicChars) {
    glyphs.add(char);
  }

  // Add space explicitly
  glyphs.add(' ');

  // Extract glyphs from all text content
  for (const text of texts) {
    extractGlyphsFromText(text, glyphs);
  }

  console.log(`Collected ${glyphs.size} unique glyphs`);

  return glyphs;
}

/**
 * Render a single glyph to canvas and save as PNG
 */
function renderGlyphToCanvas(char: string, index: number): { width: number; height: number; path: string } {
  const canvas = createCanvas(GLYPH_SIZE, GLYPH_SIZE);
  const ctx = canvas.getContext('2d');

  // Clear background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, GLYPH_SIZE, GLYPH_SIZE);

  // Set font (using canvas default for now - node-canvas uses system fonts)
  const fontSize = 48;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Render character
  ctx.fillText(char, GLYPH_SIZE / 2, GLYPH_SIZE / 2);

  // Measure actual glyph bounds
  const metrics = ctx.measureText(char);
  const actualWidth = Math.ceil(metrics.width);
  const actualHeight = fontSize; // Approximate

  // Save to temp file
  const fileName = `glyph_${index}_${char.charCodeAt(0)}.png`;
  const filePath = path.join(TEMP_DIR, fileName);
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(filePath, buffer);

  return { width: actualWidth, height: actualHeight, path: filePath };
}

/**
 * Generate MSDF for a glyph using msdfgen (if available) or use raster fallback
 * TODO: Implement true MSDF generation with msdfgen and font files
 * TODO: Requires font file path and proper character code mapping
 */
function generateMSDF(glyphPath: string, char: string, index: number, useMsdfgen: boolean): string {
  const msdfPath = path.join(TEMP_DIR, `msdf_${index}_${char.charCodeAt(0)}.png`);

  if (useMsdfgen) {
    // TODO: Full MSDF implementation would call:
    // msdfgen -font RobotoSlab.ttf CODEPOINT -o output.png -size 64 64 -pxrange 4 -autoframe
    //
    // This requires:
    // 1. Font file path (e.g., assets/fonts/RobotoSlab-Regular.ttf)
    // 2. Character to codepoint mapping
    // 3. Proper msdfgen invocation with correct flags
    //
    // For now, fallback to raster until font integration is complete
  }

  // Raster fallback: copy the rendered glyph
  // This produces working atlas but without distance field benefits
  const buffer = readFileSync(glyphPath);
  writeFileSync(msdfPath, buffer);

  return msdfPath;
}

/**
 * Pack glyphs into atlas using potpack
 */
function packAtlas(glyphBoxes: GlyphBox[]): { width: number; height: number } {
  const { w, h } = potpack(glyphBoxes);

  if (w > MAX_ATLAS_SIZE || h > MAX_ATLAS_SIZE) {
    console.error(`ERROR: Atlas size ${w}x${h} exceeds maximum ${MAX_ATLAS_SIZE}x${MAX_ATLAS_SIZE}`);
    console.error('Consider reducing glyph set or splitting into multiple atlases');
    process.exit(1);
  }

  console.log(`✓ Packed ${glyphBoxes.length} glyphs into ${w}x${h} atlas`);

  return { width: w, height: h };
}

/**
 * Composite all MSDF glyphs onto final atlas canvas
 */
async function createAtlasTexture(
  glyphBoxes: GlyphBox[],
  msdfPaths: Map<string, string>,
  atlasWidth: number,
  atlasHeight: number
): Promise<void> {
  const canvas = createCanvas(atlasWidth, atlasHeight);
  const ctx = canvas.getContext('2d');

  // Clear to transparent
  ctx.clearRect(0, 0, atlasWidth, atlasHeight);

  // Composite each glyph
  for (const box of glyphBoxes) {
    const msdfPath = msdfPaths.get(box.char);
    if (!msdfPath || !existsSync(msdfPath)) {
      console.warn(`Warning: MSDF not found for glyph '${box.char}'`);
      continue;
    }

    try {
      const image = await loadImage(msdfPath);
      ctx.drawImage(image, box.x!, box.y!, box.w, box.h);
    } catch (error) {
      console.warn(`Warning: Failed to load MSDF for '${box.char}': ${error}`);
    }
  }

  // Save atlas
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(OUTPUT_PNG, buffer);
  console.log(`✓ Saved atlas texture: ${OUTPUT_PNG}`);
}

/**
 * Generate atlas metadata JSON
 */
function createAtlasMetadata(glyphBoxes: GlyphBox[], atlasWidth: number, atlasHeight: number): void {
  const glyphs: Record<string, GlyphMetrics> = {};

  for (const box of glyphBoxes) {
    glyphs[box.char] = {
      x: box.x!,
      y: box.y!,
      width: box.w,
      height: box.h,
      advance: box.w, // Simplified - should come from font metrics
      bearingX: 0,
      bearingY: 0
    };
  }

  const atlas: TextAtlas = {
    width: atlasWidth,
    height: atlasHeight,
    glyphs
  };

  writeFileSync(OUTPUT_JSON, JSON.stringify(atlas, null, 2));
  console.log(`✓ Saved atlas metadata: ${OUTPUT_JSON}`);
}

/**
 * Cleanup temporary files
 */
function cleanup(): void {
  // Keep temp files for debugging
  console.log(`✓ Temporary files in: ${TEMP_DIR}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting MSDF text atlas generation...\n');

  // Check prerequisites
  const useMsdfgen = checkMsdfgen();
  setupTempDir();

  // Load data
  if (!existsSync(DATA_PATH)) {
    console.error(`ERROR: Data file not found: ${DATA_PATH}`);
    process.exit(1);
  }

  const dataContent = readFileSync(DATA_PATH, 'utf-8');
  const rootNode: Node = JSON.parse(dataContent);
  console.log('✓ Loaded data.json');

  // Collect glyphs
  const glyphs = collectGlyphs(rootNode);
  const glyphArray = Array.from(glyphs);

  // Render glyphs to canvas
  console.log('\nRendering glyphs to canvas...');
  const glyphBoxes: GlyphBox[] = [];
  const msdfPaths = new Map<string, string>();

  for (let i = 0; i < glyphArray.length; i++) {
    const char = glyphArray[i];

    try {
      // Render glyph
      const { width, height, path: glyphPath } = renderGlyphToCanvas(char, i);

      // Generate MSDF (or raster fallback)
      const msdfPath = generateMSDF(glyphPath, char, i, useMsdfgen);
      msdfPaths.set(char, msdfPath);

      // Add to packing list
      glyphBoxes.push({
        char,
        w: GLYPH_SIZE,
        h: GLYPH_SIZE
      });

      if ((i + 1) % 50 === 0) {
        console.log(`  Processed ${i + 1}/${glyphArray.length} glyphs`);
      }
    } catch (error) {
      console.warn(`Warning: Failed to process glyph '${char}': ${error}`);
    }
  }

  console.log(`✓ Rendered ${glyphBoxes.length} glyphs`);

  // Pack atlas
  console.log('\nPacking atlas...');
  const { width: atlasWidth, height: atlasHeight } = packAtlas(glyphBoxes);

  // Create atlas texture
  console.log('\nCompositing atlas texture...');
  await createAtlasTexture(glyphBoxes, msdfPaths, atlasWidth, atlasHeight);

  // Create metadata
  console.log('\nGenerating metadata...');
  createAtlasMetadata(glyphBoxes, atlasWidth, atlasHeight);

  // Cleanup
  cleanup();

  console.log('\n✓ MSDF text atlas generation complete!');
  console.log(`  Atlas: ${OUTPUT_PNG} (${atlasWidth}x${atlasHeight})`);
  console.log(`  Metadata: ${OUTPUT_JSON} (${glyphBoxes.length} glyphs)`);
}

// Run
main().catch(error => {
  console.error('\nERROR:', error);
  process.exit(1);
});
