import {
  linkHorizontal,
  tree as d3tree,
  create,
  event,
  zoom
} from "d3";
import { flextree } from "d3-flextree";
//import { LayoutEngine } from '@textkit/core';
import textLayout from 'tex-linebreak';

const { layoutItemsFromString, breakLines, positionItems } = textLayout;

const width = document.documentElement.clientWidth;
const height = document.documentElement.clientHeight;
const dx = 10;
const dy = 159;

const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

offscreenCanvas.width = offscreenCanvas.height = 5;

function measureText(text, fontStyle) {
  offscreenCtx.font = fontStyle;
  return offscreenCtx.measureText(text).width;
}

const lineWidth = 250;


const diagonal = linkHorizontal()
  .x(d => d.y)
  .y(d => d.x);

const fontStyle = 'regular 12px Arial';

fetch("data/data.json")
  .then(r => r.json())
  .then(data => {
    console.log(data);
    const layout = flextree({
      children: d => d.children,
      nodeSize: (d) => [d.height, d.width]
    });
    const root = layout.hierarchy(data);

    root.x0 = dy / 2;
    root.y0 = 0;
    root.descendants().forEach((d, i) => {
      const text = (d.data.content || '').replace(/<\/?p>/g, '');
      const items = layoutItemsFromString(text || '', (t) => measureText(t, fontStyle));

      // Find where to insert line-breaks in order to optimally lay out the text.

      const breakpoints = breakLines(items, lineWidth)

      // Compute the (xOffset, line number) at which to draw each box item.
      const positionedItems = positionItems(items, lineWidth, breakpoints);

      const lines = [];
      positionedItems.forEach(pi => {
        const item = items[pi.item];
        let line = lines[pi.line] || '';
        line += item.text + ' ';
        lines[pi.line] = line;
      });
      d.data.lines = lines;

      d._height = lines.length * 20;
      d.height = 20;
      d.width = lineWidth;

      d.id = i;
      d._children = d.children;
      if (d.depth && d.data.name.length !== 7) d.children = null;
    });

    const svg = create("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", "100%")
      .style("font", "10px sans-serif")
      .style("user-select", "none");

    const g = svg.append("g");

    svg.call(
      zoom()
        .extent([
          [0, 0],
          [width, height]
        ])
        .scaleExtent([0.1, 8])
        .on("zoom", zoomed)
    );

    function zoomed() {
      g.attr("transform", event.transform);
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

    function update(source) {
      const duration = event && event.altKey ? 2500 : 250;
      const nodes = root.descendants().reverse().concat([source]);
      const links = root.links();


      // Compute the new tree layout.
      layout(root);

      root.each(n => {
        n.x += height / 2;
        n.y += width / 2;
      });

      const transition = g
        .transition()
        .duration(duration)
        .tween(
          "resize",
          window.ResizeObserver ? null : () => () => svg.dispatch("toggle")
        );

      // Update the nodes…
      const node = gNode.selectAll("g").data(nodes, d => d.id);
      // Enter any new nodes at the parent's previous position.
      const nodeEnter = node
        .enter()
        .append("g")
        .attr("transform", d => `translate(${source.y0},${source.x0})`)
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0)
        .on("click", d => {
          d.children = d.children ? null : d._children;
          //d.width = d.height === d._height ? lineWidth400;
          d.height = d.height === d._height ? 20 : d._height;
          update(d);
        });

      nodeEnter
        .append("circle")
        .attr("r", 2.5)
        .attr("fill", d => (d._children ? "#444" : "#999"))
        .attr("stroke-width", 10);

      const text = nodeEnter
        .append("text")
        .attr("dy", "0.31em")
        .attr("x", 6)
        .attr("text-anchor", 'start')
        .text(d => {
          const { name, content, lines } = d.data;
          if (name === undefined) return;
          return d.children ? (name + content) : name || null;
        });

      text.clone(true)
        .lower()
        .attr("stroke-linejoin", "round")
        .attr("stroke-width", 3)
        .attr("stroke", "white");

      // nodeEnter.selectAll('text')
      //   .enter()
      //   .data(d => {console.log(d.data.lines);
      //     return d.data.lines;
      //   })
      //   .append("tspan")
      //   .text(d => {
      //     console.log(d);
      //      return d;
      //   })
      //   .attr("x", 20)
      //   .attr("dx", 10)
      //   .attr("dy", 22);

      // Transition nodes to their new position.
      const nodeUpdate = node
        .merge(nodeEnter)
        .transition(transition)
        .attr("transform", d => `translate(${d.y},${d.x})`)
        .attr("fill-opacity", 1)
        .attr("stroke-opacity", 1);

      // Transition exiting nodes to the parent's new position.
      const nodeExit = node
        .exit()
        .transition(transition)
        .remove()
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0);

      // Update the links…
      const link = gLink.selectAll("path").data(links, d => d.target.id);

      // Enter any new links at the parent's previous position.
      const linkEnter = link
        .enter()
        .append("path")
        .attr("d", d => {
          const o = { x: source.x0, y: source.y0 };
          return diagonal({ source: o, target: o });
        });

      // Transition links to their new position.
      link
        .merge(linkEnter)
        .transition(transition)
        .attr("d", diagonal);

      // Transition exiting nodes to the parent's new position.
      link
        .exit()
        .transition(transition)
        .remove()
        .attr("d", d => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o, target: o });
        });

      // Stash the old positions for transition.
      root.eachBefore(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }

    update(root);

    document.body.appendChild(svg.node());
  });
