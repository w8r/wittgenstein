import { linkHorizontal, tree as d3tree, create, event, zoom } from "d3";

import { FlextreeNode, flextree } from "d3-flextree";
//import { LayoutEngine } from '@textkit/core';
import {
  layoutItemsFromString,
  breakLines,
  positionItems,
} from "tex-linebreak";
import { measureText } from "./measure";
import "./index.css";

const width = document.documentElement.clientWidth;
const height = document.documentElement.clientHeight;
const dx = 10;
const dy = 159;

const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");

offscreenCanvas.width = offscreenCanvas.height = 5;

const lineWidth = 200;

const diagonal = linkHorizontal<unknown, unknown, { x: number; y: number }>()
  .x((d) => d.y)
  .y((d) => d.x);

const fontSize = 12;
const fontStyle = `regular ${fontSize}px 'Roboto Slab', serif`;
const closedHeight = 20;
const strokeColor = "#fff";

interface Datum {
  id: number;
  children?: Datum[];
  _children?: Datum[];
  name: string;
  content: string;
  lines: string[];
  x0: number;
  y0: number;
  _width: number;
  _height: number;
  width: number;
  height: number;
}

fetch("data/data.json")
  .then((r) => r.json())
  .then((data) => {
    data.name = "";
    const layout = flextree<Datum>({
      children: (d) => d.children,
      nodeSize: (d) => [d.data.height, d.data.width + 100],
    });
    const root = layout.hierarchy(data);
    // @ts-ignore
    window.root = root;

    root.data.x0 = dy / 2;
    root.data.y0 = 0;

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
      d.data._children = d.data.children;
      if (d.depth && d.data.name.length !== 7) {
        d.data.children = undefined;
      }
    });

    const svg = create("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", "100%")
      .style("font-size", `${fontSize}px`)
      .style("user-select", "none");

    const g = svg.append("g");

    // make zoomable
    svg.call(
      zoom<SVGSVGElement, undefined>()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.1, 8])
        .on("zoom", zoomed)
    );

    function zoomed() {
      g.attr("transform", event.transform);
      // hide the text when zooming
      // console.log(fontSize * event.transform.k);
      // scan viewport for text elements outside of viewport

      const scale = event.transform.k;

      // get viewport bounding box from event.transform
      const xMin = -event.transform.x / scale;
      const yMin = -event.transform.y / scale;
      const xMax = xMin + width / scale;
      const yMax = yMin + height / scale;
      //console.log({ xMin, yMin, xMax, yMax });

      const toHide: FlextreeNode<Datum>[] = [];
      root.eachBefore((d) => {
        const { width, height, x: y0, y: x0 } = d;
        // check if node is fully inside viewport, x and y are reversed
        const outside =
          x0 + width < xMin || x0 > xMax || y0 + height < yMin || y0 > yMax;
        const tooSmall = height * scale < 8;
        if (outside || tooSmall) toHide.push(d);
      });
      //console.log(toHide);
    }

    const gLink = g
      .append("g")
      .attr("fill", "none")
      .attr("stroke", "#555")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5);

    const gNode = g
      .append("g")
      .attr("cursor", "pointer")
      .attr("pointer-events", "all");

    function update(source: FlextreeNode<Datum>) {
      const duration = event && event.altKey ? 2500 : 250;
      const nodes = root.descendants().reverse();
      const links = root.links();

      const roots = gNode
        .selectAll<SVGGElement, FlextreeNode<Datum>>("g")
        .data([source], (d) => d.data.id);

      if (source.data.height !== closedHeight) {
        const text = roots
          .append("text")
          .attr("class", "content")
          .attr("y", -Math.floor((source.data.lines.length * 13.5) / 2 + 3))
          .attr("x", 6)
          .attr("text-anchor", "start")
          .attr("stroke", strokeColor)
          .attr("stroke-width", 3)
          .attr("paint-order", "stroke")
          .html((d) => {
            const { lines } = d.data;
            const offsetX = ((source.data.name || "").length + 2) * 8;
            return lines
              .map(
                (line) => `
              <tspan x="${offsetX}" dx="0" dy="12">${line}</tspan>
            `
              )
              .join("")
              .trim();
          });
      } else {
        roots.selectAll(".content").remove();
      }

      // Compute the new tree layout.
      layout(root);

      // initial offset
      root.each((n) => {
        n.x += height / 2;
        n.y += width / 10;
        n.data.x += height / 2;
        n.data.y += width / 10;
      });

      const transition = g
        .transition()
        .duration(duration)
        .tween(
          "resize",
          window.ResizeObserver
            ? () => () => undefined
            : () => () => svg.dispatch("toggle")
        );

      // Update the nodes…
      const node = gNode
        .selectAll<SVGGElement, FlextreeNode<Datum>>("g")
        .data(nodes, (d) => d.data.id);

      // Enter any new nodes at the parent's previous position.
      const nodeEnter = node
        .enter()
        .append("g")
        .attr(
          "transform",
          () => `translate(${source.data.y0},${source.data.x0})`
        )
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0)
        .on("click", (d: FlextreeNode<Datum>) => {
          d.data.children = d.data.children ? undefined : d.data._children;
          d.data.height =
            d.data.height === d.data._height ? closedHeight : d.data._height;
          update(d);
        });

      nodeEnter
        .append("circle")
        .attr("r", 2.5)
        .attr("fill", (d) => (d.data._children ? "#444" : "#999"))
        .attr("stroke-width", 10);

      const text = nodeEnter
        .append("text")
        .attr("class", "title")
        .attr("dy", "0.31em")
        .attr("x", 6)
        .attr("stroke", strokeColor)
        .attr("stroke-width", 3)
        .attr("paint-order", "stroke")
        .html((d) => `<tspan>${d.data.name}</tspan>`);

      if (data.lines.length > 0) {
        const text2 = nodeEnter
          .append("text")
          .attr("class", "content")
          .attr(
            "y",
            (d) => -Math.floor((d.data.lines.length * fontSize) / 2 + 3)
          )
          .attr("x", 6)
          .attr("text-anchor", "start")
          .html((d) => {
            const { lines, name } = d.data;
            if (d.data.height === closedHeight) return null;
            const offsetX = ((name || "").length + 2) * 8;
            return lines
              .map(
                (line) => `
              <tspan x="${offsetX}" dx="0" dy="12">${line}</tspan>
            `
              )
              .join("")
              .trim();
          });

        text2
          .clone(true)
          .lower()
          .attr("stroke-linejoin", "round")
          .attr("stroke-width", 3)
          .attr("stroke", "white");
      }

      // Transition nodes to their new position.
      const nodeUpdate = node
        .merge(nodeEnter)
        .transition(transition)
        .attr("transform", (d) => `translate(${d.y},${d.x})`)
        .attr("fill-opacity", 1)
        .attr("stroke-opacity", 1);

      // Transition exiting nodes to the parent's new position.
      const nodeExit = node
        .exit()
        .transition(transition)
        .remove()
        .attr("transform", (d) => `translate(${source.y},${source.x})`)
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0);

      // Update the links…
      const link = gLink
        .selectAll<SVGPathElement, FlextreeNode<Datum>>("path")
        .data(links, (d) => d.target.data.id);

      // Enter any new links at the parent's previous position.
      const linkEnter = link
        .enter()
        .append("path")
        .attr("stroke-width", 0.5)
        .attr("d", (d) => {
          const o = { x: source.data.x0, y: source.data.y0 };
          return diagonal({ source: o, target: o });
        });

      // Transition links to their new position.
      link.merge(linkEnter).transition(transition).attr("d", diagonal);

      // Transition exiting nodes to the parent's new position.
      link
        .exit()
        .transition(transition)
        .remove()
        .attr("d", (d) => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o });
        });

      // Stash the old positions for transition.
      root.eachBefore((d) => {
        d.data.x0 = d.x;
        d.data.y0 = d.y;
      });
    }

    update(root);

    document.body.appendChild(svg.node()!);

    const controls = create("div").attr("class", "controls");

    document.body.appendChild(controls.node()!);

    controls
      .append("div")
      .attr("class", "link-control")
      .text("expand all")
      .on("click", () => {
        root.each((n) => {
          n.data.children = n.data._children;
          n.data.height = n.data._height;
        });

        update(root);
      });

    controls
      .append("div")
      .attr("class", "link-control")
      .text("collapse all")
      .on("click", () => {
        root.each((n) => {
          n.data.children = undefined;
          n.data.height = closedHeight;
        });
        update(root);
      });
  });
