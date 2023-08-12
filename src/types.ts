import { FlextreeNode } from "d3-flextree";

export interface Datum {
  id: number;
  children?: Datum[];
  _children?: FlextreeNode<Datum>[];
  name: string;
  content: string;
  lines: string[];
  lineWidths: number[];
  x0: number;
  y0: number;
  _width: number;
  _height: number;
  width: number;
  height: number;
  open: boolean;
  x: number;
  y: number;
  outside: boolean;
}
