import { FlextreeNode } from 'd3-flextree';
import { Node, Rect } from './types';
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

/** Node visual state flags (bit field) */
export const NODE_HOVERED = 1;
export const NODE_SELECTED = 2;

/** A node as currently displayed (possibly mid-animation). */
export interface DrawNode {
  node: Node;
  rect: Rect;
  alpha: number;
  /** NODE_HOVERED | NODE_SELECTED */
  state: number;
}

/**
 * World-space rectangle of a laid-out node. The layout is rotated 90º CW:
 * tree depth runs along +x, siblings along -y. (x, y) is the bottom-left corner.
 */
export function nodeRect(node: TreeNode): Rect {
  const height = node.size[0];
  return {
    x: node.y,
    y: -node.x - height / 2,
    width: node.data.width,
    height
  };
}

/**
 * Serialize displayed nodes into a flat buffer for WebGPU
 * Format: [x, y, width, height, isCollapsed, state, padding, padding, r, g, b, a] × nodeCount
 */
export function serializeNodes(nodes: DrawNode[]): {
  nodeData: Float32Array<ArrayBuffer>;
  nodeCount: number;
} {
  const nodeData = new Float32Array(nodes.length * NODE_STRIDE);

  nodes.forEach(({ node, rect, alpha, state }, i) => {
    const offset = i * NODE_STRIDE;
    nodeData[offset] = rect.x;
    nodeData[offset + 1] = rect.y;
    nodeData[offset + 2] = rect.width;
    nodeData[offset + 3] = rect.height;
    // Collapsed marker only when there is something hidden
    nodeData[offset + 4] = node.collapsed && node.children?.length ? 1 : 0;
    nodeData[offset + 5] = state;

    const { r, g, b, a } = getColor(node);

    nodeData[offset + 8] = r;
    nodeData[offset + 9] = g;
    nodeData[offset + 10] = b;
    nodeData[offset + 11] = a * alpha;
  });

  return { nodeData, nodeCount: nodes.length };
}

/**
 * Serialize links between displayed nodes and their displayed parents.
 * Format: [sourceX, sourceY, targetX, targetY, cp1X, cp1Y, cp2X, cp2Y, r, g, b, a] × linkCount
 */
export function serializeLinks(
  nodes: DrawNode[],
  parentOf: Map<Node, Node>
): {
  linkData: Float32Array<ArrayBuffer>;
  linkCount: number;
} {
  const byNode = new Map(nodes.map((d) => [d.node, d]));
  const links: [DrawNode, DrawNode][] = [];
  for (const child of nodes) {
    const parent = byNode.get(parentOf.get(child.node)!);
    if (parent) links.push([parent, child]);
  }

  const linkData = new Float32Array(links.length * LINK_STRIDE);
  links.forEach(([source, target], i) => {
    const offset = i * LINK_STRIDE;

    // From the middle of the parent's right edge to the middle of the child's left edge
    const sourceX = source.rect.x + source.rect.width;
    const sourceY = source.rect.y + source.rect.height / 2;
    const targetX = target.rect.x;
    const targetY = target.rect.y + target.rect.height / 2;

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
    linkData[offset + 11] = 0.9 * target.alpha; // a
  });

  return { linkData, linkCount: links.length };
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
 * Glyph instances of a node's text relative to the node's bottom-left
 * corner. Node sizes never change, so these can be cached per node.
 */
export function nodeGlyphs(node: Node, typesetter: Typesetter): Float32Array {
  const text = node.text;
  if (!text) return new Float32Array(0);
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

  const left = PADDING_X;
  const top = node.height - PADDING_Y;

  // ID and content are both vertically centered in the node
  const inner = node.height - PADDING_Y * 2;
  pushBlock(text.id, left, top - (inner - text.id.height) / 2, PROPOSITION_ID_COLOR);

  const contentLeft = left + (node.idColumnWidth ?? 0) + ID_GAP;
  const contentTop = top - (inner - text.content.height) / 2;
  pushBlock(text.content, contentLeft, contentTop, PROPOSITION_TEXT_COLOR);

  return new Float32Array(glyphs);
}

/** Serialize the text of displayed nodes from their cached local glyphs. */
export function serializeText(
  nodes: DrawNode[],
  glyphsOf: (node: Node) => Float32Array
): {
  glyphData: Float32Array<ArrayBuffer>;
  glyphCount: number;
} {
  let length = 0;
  for (const { node } of nodes) length += glyphsOf(node).length;

  const glyphData = new Float32Array(length);
  let offset = 0;
  for (const { node, rect, alpha } of nodes) {
    const local = glyphsOf(node);
    glyphData.set(local, offset);
    for (let i = offset; i < offset + local.length; i += TEXT_GLYPH_STRIDE) {
      glyphData[i] += rect.x;
      glyphData[i + 1] += rect.y;
      glyphData[i + 11] *= alpha;
    }
    offset += local.length;
  }

  return { glyphData, glyphCount: length / TEXT_GLYPH_STRIDE };
}
