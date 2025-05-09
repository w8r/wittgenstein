import { flextree } from 'd3-flextree';
import { Node } from './types';
import { COLLAPSED_SIZE, LAYER_GAP } from './constants';

export function layout(data: Node) {
  const queue = [data];
  const depthMap: Record<number, number> = {};
  while (queue.length) {
    const node = queue.shift()!;
    if (node.collapsed) {
      node.width = COLLAPSED_SIZE;
      node.height = COLLAPSED_SIZE;
    } else {
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
