import { FlextreeNode } from 'd3-flextree';
import { Node } from './types';
import { LAYER_GAP, LINK_STRIDE, NODE_STRIDE } from './constants';

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

  return { r: r + m, g: g + m, b: b + m, a: 1.0 }; // a = 1.0 for opaque
}
