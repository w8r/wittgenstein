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

/** Opacity of the warm highlight behind hovered / selected propositions */
const HOVER_TINT = 0.35;
const SELECTED_TINT = 0.6;

/** Gap between a collapsed proposition and its "›" marker, in world units */
const MARKER_GAP = 6;
const LINK_COLOR = [0.45, 0.45, 0.45, 0.9] as const;

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

    // No visible box: the typesetting carries the structure. Only hover
    // and selection get a faint warm tint.
    const tint =
      state & NODE_SELECTED ? SELECTED_TINT : state & NODE_HOVERED ? HOVER_TINT : 0;
    nodeData[offset + 8] = 0.93;
    nodeData[offset + 9] = 0.88;
    nodeData[offset + 10] = 0.8;
    nodeData[offset + 11] = tint * alpha;
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
  // [sourceX, sourceY, targetX, targetY, alpha]
  const links: number[][] = [];
  for (const child of nodes) {
    const parent = byNode.get(parentOf.get(child.node)!);
    if (parent) {
      // From the middle of the parent's right edge to the middle of the child's left edge
      links.push([
        parent.rect.x + parent.rect.width,
        parent.rect.y + parent.rect.height / 2,
        child.rect.x,
        child.rect.y + child.rect.height / 2,
        child.alpha
      ]);
    }
  }

  const linkData = new Float32Array(links.length * LINK_STRIDE);
  links.forEach(([sourceX, sourceY, targetX, targetY, alpha], i) => {
    const offset = i * LINK_STRIDE;

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

    linkData[offset + 8] = LINK_COLOR[0];
    linkData[offset + 9] = LINK_COLOR[1];
    linkData[offset + 10] = LINK_COLOR[2];
    linkData[offset + 11] = LINK_COLOR[3] * alpha;
  });

  return { linkData, linkCount: links.length };
}

/** Glyph instances of a text block, relative to its top-left corner. */
export function blockGlyphs(
  block: TextBlock,
  typesetter: Typesetter,
  color: readonly number[]
): Float32Array {
  const glyphs: number[] = [];
  for (const glyph of block.glyphs) {
    const q = typesetter.quad(glyph, 0, 0);
    if (q) glyphs.push(q.x, q.y, q.w, q.h, q.u, q.v, q.uw, q.vh, ...color);
  }
  return new Float32Array(glyphs);
}

/** Marker shown after collapsed propositions, centered on their right edge */
export interface Marker {
  glyphs: Float32Array;
  height: number;
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
  glyphsOf: (node: Node) => Float32Array,
  marker?: Marker
): {
  glyphData: Float32Array<ArrayBuffer>;
  glyphCount: number;
} {
  const hasMarker = (node: Node) =>
    !!marker && !!node.collapsed && node.children?.length > 0;

  let length = 0;
  for (const { node } of nodes) {
    length += glyphsOf(node).length;
    if (hasMarker(node)) length += marker!.glyphs.length;
  }

  const glyphData = new Float32Array(length);
  let offset = 0;
  const place = (local: Float32Array, x: number, y: number, alpha: number) => {
    glyphData.set(local, offset);
    for (let i = offset; i < offset + local.length; i += TEXT_GLYPH_STRIDE) {
      glyphData[i] += x;
      glyphData[i + 1] += y;
      glyphData[i + 11] *= alpha;
    }
    offset += local.length;
  };
  for (const { node, rect, alpha } of nodes) {
    place(glyphsOf(node), rect.x, rect.y, alpha);
    if (hasMarker(node)) {
      const top = rect.y + rect.height / 2 + marker!.height / 2;
      place(marker!.glyphs, rect.x + rect.width + MARKER_GAP, top, alpha);
    }
  }

  return { glyphData, glyphCount: length / TEXT_GLYPH_STRIDE };
}
