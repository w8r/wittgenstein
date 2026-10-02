import { FlextreeNode } from 'd3-flextree';
import { Node } from './types';
import {
  ID_GAP,
  LINK_STRIDE,
  NODE_STRIDE,
  PADDING_X,
  PADDING_Y,
  PROPOSITION_ID_COLOR,
  PROPOSITION_TEXT_COLOR,
  TEXT_GLYPH_STRIDE
} from './constants';
import { TextBlock, Typesetter } from './text/typesetter';

type TreeNode = FlextreeNode<Node>;

/** Collects the laid-out nodes in depth-first order. */
function collectNodes(root: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  const stack: TreeNode[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    nodes.push(node);
    if (node.children) stack.push(...node.children);
  }
  return nodes;
}

/**
 * World-space rectangle of a laid-out node. The layout is rotated 90º CW:
 * tree depth runs along +x, siblings along -y. (x, y) is the bottom-left corner.
 */
export function nodeRect(node: TreeNode) {
  const height = node.size[0];
  return {
    x: node.y,
    y: -node.x - height / 2,
    width: node.data.width,
    height
  };
}

/**
 * Serialize tree nodes into a flat buffer for WebGPU
 * @param root Root node of the tree
 * @returns Object containing buffer data and counts
 */
export function serializeTreeForGPU(root: TreeNode): {
  nodeData: Float32Array<ArrayBuffer>;
  nodeCount: number;
  linkData: Float32Array<ArrayBuffer>;
  linkCount: number;
} {
  const nodes = collectNodes(root);
  const links = nodes.flatMap((source) =>
    (source.children || []).map((target) => ({ source, target }))
  );

  // Create node buffer
  // Format: [x, y, width, height, isCollapsed, hasFormula, padding1, padding2, r, g, b, a] × nodeCount
  const nodeData = new Float32Array(nodes.length * NODE_STRIDE);

  nodes.forEach((node, i) => {
    const rect = nodeRect(node);
    const offset = i * NODE_STRIDE;
    nodeData[offset] = rect.x;
    nodeData[offset + 1] = rect.y;
    nodeData[offset + 2] = rect.width;
    nodeData[offset + 3] = rect.height;
    nodeData[offset + 4] = node.data.collapsed ? 1 : 0;
    nodeData[offset + 5] = 0; // hasFormula (unused)
    nodeData[offset + 6] = 0; // padding
    nodeData[offset + 7] = 0; // padding

    const { r, g, b, a } = getColor(node.data);

    nodeData[offset + 8] = r;
    nodeData[offset + 9] = g;
    nodeData[offset + 10] = b;
    nodeData[offset + 11] = a;
  });

  // Create link buffer
  // Format: [sourceX, sourceY, targetX, targetY, controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, r, g, b, a] × linkCount
  const linkData = new Float32Array(links.length * LINK_STRIDE);

  links.forEach(({ source, target }, i) => {
    const offset = i * LINK_STRIDE;

    // From the middle of the parent's right edge to the middle of the child's left edge
    const sourceX = source.y + source.data.width;
    const sourceY = -source.x;
    const targetX = target.y;
    const targetY = -target.x;

    // Horizontal tangents at both ends
    const midX = (sourceX + targetX) / 2;

    linkData[offset] = sourceX;
    linkData[offset + 1] = sourceY;
    linkData[offset + 2] = targetX;
    linkData[offset + 3] = targetY;
    linkData[offset + 4] = midX;
    linkData[offset + 5] = sourceY;
    linkData[offset + 6] = midX;
    linkData[offset + 7] = targetY;

    linkData[offset + 8] = 0.45; // r
    linkData[offset + 9] = 0.45; // g
    linkData[offset + 10] = 0.45; // b
    linkData[offset + 11] = 0.9; // a
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

  return { r: r + m, g: g + m, b: b + m, a: 0.5 };
}

/**
 * Serialize the typeset text of all laid-out nodes into glyph instances.
 * `typesetter.buildAtlas()` must have been called.
 */
export function serializeTextForGPU(
  root: TreeNode,
  typesetter: Typesetter
): {
  glyphData: Float32Array<ArrayBuffer>;
  glyphCount: number;
} {
  const glyphs: number[] = [];

  const pushBlock = (
    block: TextBlock,
    left: number,
    top: number,
    color: readonly number[]
  ) => {
    for (const glyph of block.glyphs) {
      const q = typesetter.quad(glyph, left, top);
      if (q) glyphs.push(q.x, q.y, q.w, q.h, q.u, q.v, q.uw, q.vh, ...color);
    }
  };

  for (const node of collectNodes(root)) {
    const text = node.data.text;
    if (!text) continue;
    const rect = nodeRect(node);
    const left = rect.x + PADDING_X;
    const top = rect.y + rect.height - PADDING_Y;

    // ID and content are both vertically centered in the node
    const inner = rect.height - PADDING_Y * 2;
    const idTop = top - (inner - text.id.height) / 2;
    pushBlock(text.id, left, idTop, PROPOSITION_ID_COLOR);

    const contentLeft = left + (node.data.idColumnWidth ?? 0) + ID_GAP;
    const contentTop = top - (inner - text.content.height) / 2;
    pushBlock(text.content, contentLeft, contentTop, PROPOSITION_TEXT_COLOR);
  }

  return {
    glyphData: new Float32Array(glyphs),
    glyphCount: glyphs.length / TEXT_GLYPH_STRIDE
  };
}
