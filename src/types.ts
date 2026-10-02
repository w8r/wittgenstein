import type { TextBlock } from './text/typesetter';

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

export interface Proposition {
  id: string;
  content: string;
  width: number;
  height: number;
}

export interface Node {
  id: string;
  children: Node[];
  data?: Proposition;
  parentId?: string;
  depth: number;
  width: number;
  height: number;
  collapsed?: boolean;
  x?: number;
  y?: number;
  /** Typeset proposition text (set before layout) */
  text?: { content: TextBlock; id: TextBlock };
  /** Width of the proposition ID column, shared by all nodes of a depth */
  idColumnWidth?: number;
}

export type Point = { x: number; y: number };
