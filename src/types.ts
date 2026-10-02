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
  /** English translation (Ogden), LaTeX */
  content: string;
  /** German original, LaTeX */
  contentDe?: string;
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
  /** Typeset proposition text in the current language (set before layout) */
  text?: NodeText;
  /** Typeset proposition text per language */
  texts?: Record<Language, NodeText>;
  /** Width of the proposition ID column, shared by all nodes of a depth */
  idColumnWidth?: number;
}

export type Point = { x: number; y: number };

/** Axis-aligned world-space rectangle; (x, y) is the bottom-left corner. */
export type Rect = { x: number; y: number; width: number; height: number };

export type Language = 'en' | 'de';

export interface NodeText {
  content: TextBlock;
  id: TextBlock;
}
