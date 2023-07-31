import * as d3Zoom from "d3-zoom";
import * as d3Select from "d3-selection";
import { render, initCanvas } from "./render";
import "./index.css";
import { Datum } from "./types";
import { FlextreeLayout, FlextreeNode, flextree } from "d3-flextree";
import { quadtree } from "d3-quadtree";
import {
  layoutItemsFromString,
  breakLines,
  positionItems,
} from "tex-linebreak";
import { measureText } from "./measure";
import { linkHorizontal } from "d3";

let data: Datum;
let root: FlextreeNode<Datum>;
let hoveredNode: IndexData | undefined;
const { canvas, ctx, w, h, pxRatio } = initCanvas();

const closedHeight = 22;
const lineWidth = 200;
const diagonal = linkHorizontal<unknown, unknown, { x: number; y: number }>()
  .x((d) => d.y)
  .y((d) => d.x);

const fontSize = 12;
const fontStyle = `regular ${fontSize}px 'Roboto Slab', serif`;
const strokeColor = "#fff";

let pointer = { x: 0, y: 0 };

interface IndexData {
  id: string | number;
  x: number;
  y: number;
  width: number;
  height: number;
  node: FlextreeNode<Datum>;
}
let Q = quadtree<IndexData>();
// update the nodes quadtree
const index = (root: FlextreeNode<Datum>) => {
  const nodes: IndexData[] = [];
  root.each((n) => {
    nodes.push({
      id: n.data.id || 0,
      x: n.y,
      y: n.x,
      width: n.data.width,
      height: n.data._height,
      node: n,
    });
  });
  Q = quadtree<IndexData>()
    .x((d) => d.x)
    .y((d) => d.y)
    .addAll(nodes);
};

let currentTransform = d3Zoom.zoomIdentity;

const requestRender = () =>
  render({
    ctx,
    width: w,
    height: h,
    transform: currentTransform,
    pxRatio,
    data: root,
    pointer,
    hoveredNode: hoveredNode?.node,
  });

const onZoom = ({
  transform,
}: d3Zoom.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
  currentTransform = transform;
  requestRender();
  index(root);
};

function update(
  node: FlextreeNode<Datum>,
  root: FlextreeNode<Datum>,
  layout: FlextreeLayout<Datum>
) {
  const nodes = root.descendants().reverse();
  const links = root.links();

  layout(root);

  // initial offset
  root.each((n) => {
    n.data.x = n.x + h / 2;
    n.data.y = n.y + w / 10;
  });

  // move closed nodes to their parents
}

fetch("data/data.json")
  .then((r) => r.json())
  .then((response) => {
    data = response;

    const layout = flextree<Datum>({
      children: (d) => d.children,
      nodeSize: (d) => [d.data.height, d.data.width + 100],
    });
    root = layout.hierarchy(data);

    // measure nodes
    root.descendants().forEach((d, i) => {
      const text = (d.data.content || "").replace(/<\/?p>/g, "");
      const items = layoutItemsFromString(text || "", (t: string) =>
        measureText(t, fontStyle)
      );

      // Find where to insert line-breaks in order to optimally lay out the text.
      const breakpoints = breakLines(items, lineWidth);
      // Compute the (xOffset, line number) at which to draw each box item.
      const positionedItems = positionItems(items, lineWidth, breakpoints);

      const lines: string[] = [];
      positionedItems.forEach((pi: { item: number; line: number }) => {
        const item = items[pi.item];
        let line = lines[pi.line] || "";
        line += item.text + " ";
        lines[pi.line] = line;
      });
      d.data.lines = lines;
      d.data._height = lines.length * 22;
      d.data.height = closedHeight;
      d.data.width = lineWidth;

      d.data.id = i;
      d.data._children = d.children;
      d.data.open = false;
      d.children = undefined;
    });
    const openNodes = new Set<number>([root.data.id]);
    [root, ...root.data._children!].forEach((n) => {
      n.data.open = true;
      n.children = n.data._children;
      openNodes.add(n.data.id);
    });

    layout(root);

    let i = 0;
    root.eachBefore((n) => {
      if (n.data.children) i++;
    });

    root.each((d) => {
      if (!d.data.open) d.data.height = 0;
      else d.data.height = d.data._height;
    });
    layout(root);

    //update(root, root, layout);

    const selection = d3Select.select<HTMLCanvasElement, null>(canvas);
    const zoom = d3Zoom
      .zoom<HTMLCanvasElement, null>()
      .scaleExtent([0.001, 10])
      .on("zoom", onZoom);
    selection.call(zoom);
    selection.call(zoom.scaleTo, 0.1);

    index(root);

    canvas.addEventListener("mousemove", (evt) => {
      // transform mouse position by current zoom transform
      const t = currentTransform;

      const ex = (pxRatio * evt.x - pxRatio * t.x) / t.k;
      const ey = (pxRatio * evt.y - pxRatio * t.y) / t.k;

      pointer = { x: ex, y: ey };

      hoveredNode = Q.find(ex, ey, 15);
      requestRender();
    });
  });
