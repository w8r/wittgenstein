import { flextree } from 'd3-flextree';
import { Node } from './types';
import {
  EMPTY_NODE_SIZE,
  FIXED_TEXT_WIDTH,
  ID_FONT_SIZE,
  ID_GAP,
  LAYER_GAP,
  PADDING_X,
  PADDING_Y,
  SIBLING_GAP,
  SUBTREE_GAP,
  TEXT_FONT_SIZE
} from './constants';
import { parseLatex } from './text/latex';
import { Typesetter } from './text/typesetter';

/** Visits every node of the tree, including collapsed branches. */
export function forEachNode(root: Node, fn: (node: Node) => void) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    fn(node);
    if (node.children) stack.push(...node.children);
  }
}

/**
 * Typesets every proposition (content and ID). Must run before
 * `typesetter.buildAtlas()` and `layout()`.
 */
export function typesetTree(root: Node, typesetter: Typesetter) {
  forEachNode(root, (node) => {
    if (!node.data?.content) return;
    node.text = {
      content: typesetter.layout(
        parseLatex(node.data.content),
        TEXT_FONT_SIZE,
        FIXED_TEXT_WIDTH
      ),
      id: typesetter.layout(
        [{ type: 'text', text: node.data.id, italic: false, script: 0, math: false }],
        ID_FONT_SIZE
      )
    };
  });
}

/**
 * Sizes nodes from their typeset text and computes the tree layout.
 * Children of collapsed nodes are excluded.
 */
export function layout(data: Node) {
  // ID column width per depth so that texts of a column line up
  const idColumns: Record<number, number> = {};
  forEachNode(data, (node) => {
    if (node.text) {
      idColumns[node.depth] = Math.max(
        idColumns[node.depth] || 0,
        node.text.id.width
      );
    }
  });

  const depthMap: Record<number, number> = {};
  forEachNode(data, (node) => {
    if (node.text) {
      const { content, id } = node.text;
      node.idColumnWidth = idColumns[node.depth];
      node.width = PADDING_X * 2 + node.idColumnWidth + ID_GAP + content.width;
      node.height = PADDING_Y * 2 + Math.max(content.height, id.height);
    } else {
      node.width = EMPTY_NODE_SIZE;
      node.height = EMPTY_NODE_SIZE;
    }
    depthMap[node.depth] = Math.max(depthMap[node.depth] || 0, node.width);
  });

  const layout = flextree<Node>({
    nodeSize: (d) => [d.data.height, depthMap[d.data.depth] + LAYER_GAP],
    children: (d) => (d.collapsed ? undefined : d.children),
    spacing: (a, b) => (a.parent === b.parent ? SIBLING_GAP : SUBTREE_GAP)
  });
  const tree = layout.hierarchy(data);
  return layout(tree);
}
