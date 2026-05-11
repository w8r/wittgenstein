import { flextree } from 'd3-flextree';
import { Node, TextAtlas } from './types';
import {
  COLLAPSED_SIZE,
  LAYER_GAP,
  FIXED_TEXT_WIDTH,
  PADDING_X,
  PADDING_Y,
  ID_WIDTH
} from './constants';
import { measureText } from './buffers';

export function layout(data: Node, textAtlas?: TextAtlas) {
  const queue = [data];
  const depthMap: Record<number, number> = {};

  // Pre-process nodes to measure text and set sizes
  while (queue.length) {
    const node = queue.shift()!;

    if (node.collapsed) {
      node.width = COLLAPSED_SIZE;
      node.height = COLLAPSED_SIZE;
    } else if (node.data && node.data.content && textAtlas) {
      // Measure text layout to determine node size
      const textLayout = measureText(
        node.data.content,
        textAtlas,
        1.0, // Normal scale
        FIXED_TEXT_WIDTH
      );

      // Set node dimensions based on text + padding
      node.width = textLayout.width + PADDING_X * 2 + ID_WIDTH;
      node.height = textLayout.height + PADDING_Y * 2;

      // Update proposition data with calculated dimensions
      node.data.width = node.width;
      node.data.height = node.height;
    } else {
      // Fallback size for nodes without text or atlas
      node.width = node.data?.width || COLLAPSED_SIZE;
      node.height = node.data?.height || COLLAPSED_SIZE;
    }

    depthMap[node.depth] = Math.max(depthMap[node.depth] || 0, node.width);

    if (node.children) {
      queue.push(...node.children);
    }
  }

  const layout = flextree<Node>({
    nodeSize: (d) => [d.data.height, depthMap[d.data.depth] + LAYER_GAP],
    children: (d) => d.children,
    spacing: () => 30
  });
  const tree = layout.hierarchy(data);
  return layout(tree);
}
