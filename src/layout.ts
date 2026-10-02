import { flextree } from 'd3-flextree';
import { Language, Node } from './types';
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
import { createYielder, type ProgressCallback } from './util/yield';

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
 * Removes the placeholder nodes the numbering scheme creates for
 * propositions that don't exist (e.g. "2.0" as the parent of 2.01, 2.02):
 * their children are attached to the real parent in their place, keeping
 * the reading order. Depths are recomputed.
 */
export function removePlaceholders(root: Node) {
  const lift = (children: Node[]): Node[] =>
    children.flatMap((child) =>
      child.data ? [child] : lift(child.children || [])
    );
  const visit = (node: Node, depth: number) => {
    node.depth = depth;
    node.children = lift(node.children || []);
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 0);
}

/**
 * Typesets every proposition (content and ID). Must run before
 * `typesetter.buildAtlas()` and `layout()`.
 */
export async function typesetTree(
  root: Node,
  typesetter: Typesetter,
  language: Language,
  onProgress?: ProgressCallback
) {
  const nodes: Node[] = [];
  forEachNode(root, (node) => {
    if (node.data?.content) nodes.push(node);
  });
  const yieldToBrowser = createYielder();
  for (const [i, node] of nodes.entries()) {
    const data = node.data!;
    const id = typesetter.layout(
      [{ type: 'text', text: data.id, italic: false, script: 0, math: false }],
      ID_FONT_SIZE
    );
    const typeset = (source: string) =>
      typesetter.layout(parseLatex(source), TEXT_FONT_SIZE, FIXED_TEXT_WIDTH);
    node.texts = {
      en: { id, content: typeset(data.content) },
      de: { id, content: typeset(data.contentDe ?? data.content) }
    };
    node.text = node.texts[language];
    onProgress?.((i + 1) / nodes.length);
    await yieldToBrowser();
  }
}

/** Switches every node to its text in `language` */
export function setTreeLanguage(root: Node, language: Language) {
  forEachNode(root, (node) => {
    if (node.texts) node.text = node.texts[language];
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

  // All boxes of a column share its width, for a steady reading rhythm
  forEachNode(data, (node) => {
    if (node.text) node.width = depthMap[node.depth];
  });

  const layout = flextree<Node>({
    nodeSize: (d) => [d.data.height, depthMap[d.data.depth] + LAYER_GAP],
    children: (d) => (d.collapsed ? undefined : d.children),
    spacing: (a, b) => (a.parent === b.parent ? SIBLING_GAP : SUBTREE_GAP)
  });
  const tree = layout.hierarchy(data);
  return layout(tree);
}
