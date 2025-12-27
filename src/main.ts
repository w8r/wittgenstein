import { Viewer } from '.';
import './style.css';

new Viewer(document.getElementById('canvas') as HTMLCanvasElement);

interface TreeNode {
  id: string;
  parentId: string;
  children: TreeNode[];
  depth: number;
  data: { id: string; content: string; width: number; height: number };
  collapsed?: boolean;
  x?: number;
  y?: number;
  modifier?: number;
}

interface LayoutConfig {
  nodeWidth: number; // Width of node including padding
  nodeHeight: number; // Height of node including padding
  siblingSeparation: number; // Horizontal gap between siblings
  levelSeparation: number; // Vertical gap between levels
}

function calculateTreeLayout(root: TreeNode, config: LayoutConfig): TreeNode {
  // Initialize node properties
  const stack: TreeNode[] = [root];
  const nodes: TreeNode[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    nodes.push(node);
    node.x = 0;
    node.y = node.depth * config.levelSeparation;
    node.modifier = 0;
    if (!node.collapsed) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }

  // Assign preliminary x-coordinates (left-to-right)
  const levelMap: Map<number, TreeNode[]> = new Map();
  for (const node of nodes) {
    if (!levelMap.has(node.depth)) levelMap.set(node.depth, []);
    levelMap.get(node.depth)!.push(node);
  }

  for (const [depth, levelNodes] of levelMap) {
    let prevX = 0;
    for (const node of levelNodes) {
      if (node.children.length && !node.collapsed) {
        // Center parent over children
        const children = node.children;
        const leftmost = children[0];
        const rightmost = children[children.length - 1];
        node.x =
          (leftmost.x! + rightmost.x! + rightmost.data.width) / 2 -
          node.data.width / 2;
      } else {
        // Leaf or collapsed node
        node.x = prevX;
        prevX += node.data.width + config.siblingSeparation;
      }
    }
  }

  // Adjust x-coordinates to avoid overlap
  for (const node of nodes.reverse()) {
    if (node.children.length && !node.collapsed) {
      // Shift subtrees to resolve conflicts
      const contours: number[] = [];
      for (const child of node.children) {
        let shift = 0;
        if (contours.length) {
          const prevRight = contours[contours.length - 1];
          const currLeft = child.x!;
          if (currLeft < prevRight + config.siblingSeparation) {
            shift = prevRight + config.siblingSeparation - currLeft;
            child.x! += shift;
            child.modifier! += shift;
          }
        }
        contours.push(child.x! + child.data.width);
        // Apply modifier to descendants
        const stack = [child];
        while (stack.length) {
          const curr = stack.pop()!;
          curr.x! += curr.modifier!;
          if (!curr.collapsed) {
            for (const c of curr.children) stack.push(c);
          }
        }
      }
    }
  }

  // Finalize positions
  for (const node of nodes) {
    node.x! += node.modifier!;
  }

  return root;
}

// Example usage
const config: LayoutConfig = {
  nodeWidth: 200,
  nodeHeight: 50,
  siblingSeparation: 20,
  levelSeparation: 100
};

// Test with your tree
const tree: TreeNode = {
  id: '0',
  parentId: '-1',
  depth: 0,
  data: { id: '0', content: 'Root', width: 200, height: 3 },
  children: [
    {
      id: '5',
      parentId: '0',
      depth: 1,
      data: { id: '5', content: 'Node 5', width: 200, height: 3 },
      children: [
        {
          id: '51',
          parentId: '5',
          depth: 2,
          data: { id: '5.1', content: 'Node 51', width: 200, height: 3 },
          children: [
            {
              id: '514',
              parentId: '51',
              depth: 3,
              data: { id: '5.14', content: 'Node 514', width: 200, height: 3 },
              children: [
                {
                  id: '5141',
                  parentId: '514',
                  depth: 4,
                  data: {
                    id: '5.141',
                    content:
                      'If $p$ follows from $q$ and $q$ from $p$ then they are\none and the same proposition.',
                    width: 200,
                    height: 3
                  },
                  children: []
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

const laidOutTree = calculateTreeLayout(tree, config);
console.log(laidOutTree, tree);
