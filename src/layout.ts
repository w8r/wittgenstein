import { flextree } from 'd3-flextree';
import { Node } from './types';

export function layout(data: Node) {
  const queue = [data];
  while (queue.length) {
    const node = queue.shift()!;
    if (node.collapsed) {
      node.width = 20;
      node.height = 20;
    } else {
      node.width = node.data?.width || 20;
      node.height = node.data?.height || 20;
    }
    if (node.children) {
      queue.push(...node.children);
    }
  }

  const layout = flextree<Node>({
    nodeSize: (d) => [d.data.width, d.data.height],
    spacing: (d) => 30
  });
  const tree = layout.hierarchy(data);
  return layout(tree);
}
