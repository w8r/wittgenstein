export interface TreeNode {
  id: number;
  parentId: number;
  children: TreeNode[];
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Point = { x: number; y: number };
