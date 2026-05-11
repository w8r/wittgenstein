import { FlextreeNode } from 'd3-flextree';
import { Node, TextAtlas, GlyphMetrics } from './types';
import {
  LINK_STRIDE,
  NODE_STRIDE,
  TEXT_GLYPH_STRIDE,
  PROPOSITION_ID_COLOR,
  PROPOSITION_TEXT_COLOR,
  PROPOSITION_ID_SCALE,
  LINE_HEIGHT,
  ID_OFFSET,
  PADDING_X,
  PADDING_Y,
  ID_WIDTH
} from './constants';
import { TexLinebreak } from 'tex-linebreak2';

type TreeNode = FlextreeNode<Node>;

/**
 * Serialize tree nodes into a flat buffer for WebGPU
 * @param root Root node of the tree
 * @returns Object containing buffer data and counts
 */
export function serializeTreeForGPU(root: TreeNode): {
  nodeData: Float32Array;
  nodeCount: number;
  linkData: Float32Array;
  linkCount: number;
} {
  // Collect all visible nodes and links
  const nodes: TreeNode[] = [];
  const links: { source: TreeNode; target: TreeNode }[] = [];

  // non-recursive function to collect nodes and links
  const stack: TreeNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    nodes.push(node);
    // Process children if not collapsed
    if (!node.data.collapsed && node.children && node.children.length > 0) {
      for (const child of node.children) {
        // Add link between this node and child
        links.push({
          source: node,
          target: child
        });
        // Process child node
        stack.push(child);
      }
    }
  }

  // Create node buffer
  // Format: [x, y, width, height, isCollapsed, hasFormula, padding1, padding2, r, g, b, a] × nodeCount
  const nodeData = new Float32Array(nodes.length * NODE_STRIDE);

  nodes.forEach((node, i) => {
    const { x, y, size } = node;
    const offset = i * NODE_STRIDE;
    // everything is rotated 90ºCW
    nodeData[offset] = y;
    nodeData[offset + 1] = -x - size[0] / 2;
    nodeData[offset + 2] = node.data.width!;
    nodeData[offset + 3] = size[0]!;
    nodeData[offset + 4] = node.data.collapsed ? 1 : 0;
    nodeData[offset + 5] = 0; //node.text?.includes('$') ? 1 : 0; // Check for math formulas
    nodeData[offset + 6] = 0; // padding
    nodeData[offset + 7] = 0; // padding

    const { r, g, b, a } = getColor(node.data);

    nodeData[offset + 8] = r; // r
    nodeData[offset + 9] = g; // g
    nodeData[offset + 10] = b; // b
    nodeData[offset + 11] = a; // a
  });

  // Create link buffer
  // Format: [sourceX, sourceY, targetX, targetY, controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, r, g, b, a] × linkCount
  const linkData = new Float32Array(links.length * LINK_STRIDE);

  console.log('Link data:', links);

  links.forEach(({ source, target }, i) => {
    const offset = i * LINK_STRIDE;

    // Calculate link endpoints (center of nodes' edges)
    const sourceX = source.y; // + source.data.width!;
    const sourceY = -source.x!;
    const targetX = target.y;
    const targetY = -target.x!;

    // Calculate control points for a cubic Bezier curve
    const controlPoint1X = (sourceX + targetX) / 2;
    const controlPoint1Y = sourceY;
    const controlPoint2X = (sourceX + targetX) / 2;
    const controlPoint2Y = targetY;

    linkData[offset] = sourceX;
    linkData[offset + 1] = sourceY;
    linkData[offset + 2] = targetX;
    linkData[offset + 3] = targetY;
    linkData[offset + 4] = controlPoint1X;
    linkData[offset + 5] = controlPoint1Y;
    linkData[offset + 6] = controlPoint2X;
    linkData[offset + 7] = controlPoint2Y;

    // Link color (gray by default)
    linkData[offset + 8] = 0.6; // r
    linkData[offset + 9] = 0.6; // g
    linkData[offset + 10] = 0.6; // b
    linkData[offset + 11] = 0.7; // a (semitransparent)
  });

  return {
    nodeData,
    nodeCount: nodes.length,
    linkData,
    linkCount: links.length
  };
}

function getColor(node: Node) {
  const level = node.depth || 0;
  const hue = (level * 30) % 360; // Vary hue based on level
  // Convert HSL to RGB (simple conversion)
  const h = hue / 60;
  const s = 0.7;
  const l = 0.9;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 1) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 2) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 3) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 4) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 5) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return { r: r + m, g: g + m, b: b + m, a: 0.5 }; // a = 1.0 for opaque
}

/**
 * Serialize text glyphs for GPU rendering from tree data
 * @param root Root node of the tree
 * @returns Object containing glyph buffer data and count
 */
export async function serializeTextForGPU(root: TreeNode): Promise<{
  glyphData: Float32Array;
  glyphCount: number;
}> {
  try {
    // 1. Load text atlas metadata
    const atlasResponse = await fetch('text-atlas.json');
    if (!atlasResponse.ok) {
      console.error('Failed to load text-atlas.json');
      return { glyphData: new Float32Array(0), glyphCount: 0 };
    }
    const atlas: TextAtlas = await atlasResponse.json();

    // 2. Traverse tree, collect all nodes with text
    const glyphs: number[] = [];

    function traverse(node: TreeNode) {
      if (node.data.data && node.data.data.content) {
        const proposition = node.data.data;

        // Calculate text block position (rotated 90° clockwise)
        const textBlockX = node.y + PADDING_X + ID_WIDTH;
        const textBlockY = -node.x! - node.size[0] / 2 + PADDING_Y;

        // Render proposition content first to get dimensions
        const contentLayout = layoutText(
          proposition.content,
          textBlockX,
          textBlockY,
          atlas,
          PROPOSITION_TEXT_COLOR,
          1.0, // Normal scale
          proposition.width // Fixed width for wrapping
        );
        glyphs.push(...contentLayout.glyphs);

        // Position ID at vertical center of text block (not node center)
        const idY = textBlockY + contentLayout.height / 2;
        const idX = node.y + PADDING_X; // To the left of text

        // Render proposition ID (vertically centered with text)
        const idLayout = layoutText(
          proposition.id, // e.g., "1.11"
          idX,
          idY,
          atlas,
          PROPOSITION_ID_COLOR,
          PROPOSITION_ID_SCALE
        );
        glyphs.push(...idLayout.glyphs);
      }

      node.children?.forEach(traverse);
    }

    traverse(root);

    return {
      glyphData: new Float32Array(glyphs),
      glyphCount: glyphs.length / TEXT_GLYPH_STRIDE
    };
  } catch (error) {
    console.error('Error serializing text for GPU:', error);
    return { glyphData: new Float32Array(0), glyphCount: 0 };
  }
}

/**
 * Layout text with line breaking and return glyph data plus dimensions
 */
export function layoutText(
  text: string,
  x: number,
  y: number,
  atlas: TextAtlas,
  color: readonly number[],
  scale: number,
  maxWidth?: number
): { glyphs: number[]; width: number; height: number } {
  const glyphs: number[] = [];
  let maxLineWidth = 0;
  let currentY = y;

  // Handle empty text
  if (!text || text.trim().length === 0) {
    return { glyphs: [], width: 0, height: 0 };
  }

  // If maxWidth is specified, use tex-linebreak2 for quality line breaking
  if (maxWidth) {

    // Measure function for tex-linebreak2
    const measureFn = (word: string) => {
      let width = 0;
      for (const char of word) {
        const metrics = atlas.glyphs[char];
        if (metrics) {
          width += metrics.advance * scale;
        }
      }
      return width;
    };

    // Use tex-linebreak2 for Knuth-Plass line breaking
    const linebreaker = new TexLinebreak(text, {
      lineWidth: maxWidth,
      measureFn,
      justify: false,
      align: 'left'
    });

    const lines = linebreaker.lines;

    // Layout each line
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineText = line.plaintext;

      let cursorX = x;

      // Layout glyphs for this line
      for (const char of lineText) {
        const metrics = atlas.glyphs[char];
        if (!metrics) {
          console.warn(`Glyph not found in atlas: ${char}`);
          continue;
        }

        glyphs.push(
          cursorX + metrics.bearingX * scale, // posX
          currentY + metrics.bearingY * scale, // posY
          metrics.x / atlas.width, // atlasPosX (normalized)
          metrics.y / atlas.height, // atlasPosY (normalized)
          metrics.width / atlas.width, // atlasSizeX (normalized)
          metrics.height / atlas.height, // atlasSizeY (normalized)
          metrics.width * scale, // glyphSizeX (world space)
          metrics.height * scale, // glyphSizeY (world space)
          ...color, // colorR, colorG, colorB, colorA
          0,
          0,
          0,
          0 // padding for alignment
        );

        cursorX += metrics.advance * scale;
      }

      // Track maximum line width
      const lineWidth = cursorX - x;
      maxLineWidth = Math.max(maxLineWidth, lineWidth);

      // Advance to next line
      currentY += LINE_HEIGHT * scale;
    }

    const height = lines.length * LINE_HEIGHT * scale;
    return { glyphs, width: maxLineWidth, height };
  } else {
    // Simple left-to-right layout without line breaking
    let cursorX = x;
    let lineCount = 1;

    for (const char of text) {
      if (char === '\n') {
        const lineWidth = cursorX - x;
        maxLineWidth = Math.max(maxLineWidth, lineWidth);
        cursorX = x;
        currentY += LINE_HEIGHT * scale;
        lineCount++;
        continue;
      }

      const metrics = atlas.glyphs[char];
      if (!metrics) {
        console.warn(`Glyph not found in atlas: ${char}`);
        continue;
      }

      glyphs.push(
        cursorX + metrics.bearingX * scale, // posX
        currentY + metrics.bearingY * scale, // posY
        metrics.x / atlas.width, // atlasPosX (normalized)
        metrics.y / atlas.height, // atlasPosY (normalized)
        metrics.width / atlas.width, // atlasSizeX (normalized)
        metrics.height / atlas.height, // atlasSizeY (normalized)
        metrics.width * scale, // glyphSizeX (world space)
        metrics.height * scale, // glyphSizeY (world space)
        ...color, // colorR, colorG, colorB, colorA
        0,
        0,
        0,
        0 // padding for alignment
      );

      cursorX += metrics.advance * scale;
    }

    // Track the final line width
    const finalLineWidth = cursorX - x;
    maxLineWidth = Math.max(maxLineWidth, finalLineWidth);

    const height = lineCount * LINE_HEIGHT * scale;
    return { glyphs, width: maxLineWidth, height };
  }
}

/**
 * Measure text dimensions without generating glyphs (lighter weight for layout calculations)
 */
export function measureText(
  text: string,
  atlas: TextAtlas,
  scale: number,
  maxWidth?: number
): { width: number; height: number } {
  // Handle empty text
  if (!text || text.trim().length === 0) {
    return { width: 0, height: 0 };
  }

  // If maxWidth is specified, use tex-linebreak2 for accurate measurement
  if (maxWidth) {

    // Measure function for tex-linebreak2
    const measureFn = (word: string) => {
      let width = 0;
      for (const char of word) {
        const metrics = atlas.glyphs[char];
        if (metrics) {
          width += metrics.advance * scale;
        }
      }
      return width;
    };

    const linebreaker = new TexLinebreak(text, {
      lineWidth: maxWidth,
      measureFn,
      justify: false,
      align: 'left'
    });

    const lines = linebreaker.lines;
    let maxLineWidth = 0;

    // Measure each line
    for (const line of lines) {
      const lineText = line.plaintext;
      let lineWidth = 0;

      for (const char of lineText) {
        const metrics = atlas.glyphs[char];
        if (metrics) {
          lineWidth += metrics.advance * scale;
        }
      }

      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }

    return {
      width: maxLineWidth,
      height: lines.length * LINE_HEIGHT * scale
    };
  } else {
    // Simple measurement without line breaking
    let currentLineWidth = 0;
    let maxLineWidth = 0;
    let lineCount = 1;

    for (const char of text) {
      if (char === '\n') {
        maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
        currentLineWidth = 0;
        lineCount++;
        continue;
      }

      const metrics = atlas.glyphs[char];
      if (metrics) {
        currentLineWidth += metrics.advance * scale;
      }
    }

    maxLineWidth = Math.max(maxLineWidth, currentLineWidth);

    return {
      width: maxLineWidth,
      height: lineCount * LINE_HEIGHT * scale
    };
  }
}
