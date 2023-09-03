import * as d3Zoom from "d3-zoom";
import * as d3Select from "d3-selection";
import { render, initCanvas } from "./render";
import "./index.css";
import { Datum } from "./types";
import { FlextreeNode, flextree } from "d3-flextree";
import { quadtree } from "d3-quadtree";
import {
  layoutItemsFromString,
  breakLines,
  positionItems,
} from "tex-linebreak";
import { measureText } from "./measure";
import { fontStyle } from "./const";
import { animate } from "./animation";

// array of 10 dark pastel colors
const colors = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC949",
  "#AF7AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
];

// add hidden fields to FlextreeNode

declare module "d3-flextree" {
  interface FlextreeNode<Datum> {
    collapsedChildren: FlextreeNode<Datum>[];
  }
}

// TODO:
// [x] - measurements
// [x] - line breaks
// [x] - line measurements caching
// [x] - click expand / collapse
// [ ] - animate expand / collapse
// [ ] - text rendering
// [ ] - hide texts that are too small or outside of the viewport

let data: Datum;
let root: FlextreeNode<Datum>;
let hoveredNode: IndexData | undefined;
const { canvas, ctx, w, h, pxRatio } = initCanvas();

const width = document.documentElement.clientWidth;
const height = document.documentElement.clientHeight;

const closedHeight = 0;
const lineWidth = 200;
const duration = 250;

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
      x: n.data.y,
      y: n.data.x,
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

const project = (px: number, py: number) => {
  const { x, y, k } = currentTransform;

  return {
    x: (pxRatio * px - pxRatio * x) / k,
    y: (pxRatio * py - pxRatio * y) / k,
  };
};

const requestRender = () => {
  requestAnimationFrame(() => {
    //console.time("render");
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
    //console.timeEnd("render");
  });
};

const onZoom = ({
  transform,
}: d3Zoom.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
  currentTransform = transform;
  index(root);
  requestRender();
};

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
      // for the skeleton replacement
      const lineWidths = lines.map((line) => measureText(line, fontStyle));

      d.data.lineWidths = lineWidths;
      d.data.lines = lines;
      d.data._height = lines.length * 22;
      d.data.height = closedHeight;
      d.data.width = lineWidth;

      d.data.id = i;
      d.data._children = d.children;
      d.data.open = true;
      //d.children = undefined;
      data.outside = false;
    });
    layout(root);
    [root, ...root.data._children!].forEach((n) => {
      if (n.data.name) {
        n.descendants().forEach((d) => {
          if (d === n) return;
          d.collapsedChildren = d.children!;
          d.children = undefined; //n.data._children;
        });
        n.collapsedChildren = n.children!;
        n.children = undefined; //n.data._children;
      }
    });
    layout(root);

    root.each((d) => {
      if (!d.data.open) {
        //d.children = undefined;
        //d.data.height = 0;
      } else d.data.height = d.data._height;
    });

    layout(root);

    root.each(({ data, x, y }) => {
      data.x = x;
      data.y = y;
    });

    //update(root, root, layout);

    const selection = d3Select.select<HTMLCanvasElement, null>(canvas);
    const zoom = d3Zoom
      .zoom<HTMLCanvasElement, null>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.1, 10])
      .on("zoom", onZoom);
    selection.call(zoom);

    const zoomToBounds = (x0: number, y0: number, x1: number, y1: number) => {
      console.log("zoom to bounds", x0, y0, x1, y1);
      const tr = d3Zoom.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(
          Math.min(10, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height))
        )
        .translate(-(x0 + x1) / 2, 0);

      zoom.transform(selection, tr);
    };

    const { x0, x1, y0, y1 } = getBounds(root);
    zoomToBounds(x0, y0, x1, y1);

    window.root = root;
    window.zoomToBounds = zoomToBounds;
    window.getBounds = () => getBounds(root);

    index(root);

    window.fit = () => {
      const { x0, x1, y0, y1 } = getBounds(root);
      zoomToBounds(x0, y0, x1, y1);
    };

    document.documentElement.addEventListener("mousemove", (evt) => {
      requestAnimationFrame(() => {
        const tolerance = 10;
        pointer = project(evt.x, evt.y);
        requestRender();
        hoveredNode = Q.find(pointer.x, pointer.y + 5, 50);
        if (
          hoveredNode &&
          Math.hypot(pointer.x - hoveredNode.x, pointer.y + 5 - hoveredNode.y) >
            tolerance
        )
          hoveredNode = undefined;
        canvas.style.cursor = hoveredNode ? "pointer" : "default";
      });
    });

    function update(node: FlextreeNode<Datum>) {
      let collapse = !!node.children;
      if (collapse) {
        // collapse
        node.eachAfter(({ data }) => {
          data.height = closedHeight;
        });
        node.data.height = node.data._height;
      } else {
        // expand
        node.children = node.collapsedChildren;
        node.eachAfter(({ data }) => {
          data.height = data._height;
        });
        //node.children = node.collapsedChildren;
      }
      root.each(({ data, x, y }) => {
        data.x0 = x;
        data.y0 = y;
      });

      layout(root);
      // propagate coords for all the
      animate(duration, (t) => {
        root.eachAfter(({ data, x, y }) => {
          data.x = data.x0 + (x - data.x0) * t;
          data.y = data.y0 + (y - data.y0) * t;
        });
        requestRender();
      }).then(() => {
        if (collapse) {
          node.collapsedChildren = node.children!;
          node.children = undefined;
        }
        requestRender();
        index(root);
      });
    }

    document.documentElement.addEventListener("click", () => {
      if (!hoveredNode) return;
      const { node } = hoveredNode;
      console.log("clicked", node);
      update(node);
    });
    document
      .getElementById("action-collapse")!
      .addEventListener("click", () => {
        root.each((d) => {
          if (d.data.name) {
            d.data.open = false;
            d.children = undefined;
          }
        });
        update(root);
      });

    document.getElementById("action-expand")!.addEventListener("click", () => {
      const Q = [root];
      while (Q.length) {
        const node = Q.pop()!;
        if (node.collapsedChildren) {
          node.children = node.collapsedChildren;
          node.data.height = node.data._height;
          Q.push(...node.children);
        }
      }

      root.each((d) => {
        d.data.height = d.data._height;
      });
      update(root);
    });
  });

function getBounds(root: FlextreeNode<Datum>) {
  let x0 = Infinity;
  let x1 = -x0;
  let y0 = x0;
  let y1 = x1;
  root.eachAfter((d) => {
    const width = d.data.width;
    const height = d.data.height;
    const x = d.x;
    const y = d.y;

    // add to bounding box
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + width);
    y0 = Math.min(y0, y - height);
    y1 = Math.max(y1, y);
  });
  const h = 0;
  return { x0, x1, y0: y0 - h / 2, y1: y1 - h / 2 };
}
