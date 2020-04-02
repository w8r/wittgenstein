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

const lineWidth = 200;

function clicked(d) {
  const [[x0, y0], [x1, y1]] = path.bounds(d);
  d3.event.stopPropagation();
  svg.transition().duration(750).call(
    zoom.transform,
    d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
    d3.mouse(svg.node())
  );
}

const diagonal = linkHorizontal()
  .x(d => d.y)
  .y(d => d.x);

const fontStyle = 'regular 12px Arial';
const closedHeight = 20;

fetch("data/data.json")
  .then(r => r.json())
  .then(data => {
    const layout = flextree({
      children: d => d.children,
      nodeSize: (d) => [d.height, d.width + 100]
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

      d._height = lines.length * 22;
      d.height = closedHeight;
      d.width = lineWidth;

      d.id = i;
      d._children = d.children;
      if (d.depth && d.data.name.length !== 7) d.children = null;
      if (!d._children) d.leaf = true;
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
      const nodes = root.descendants().reverse();
      const links = root.links();

      const roots = gNode.selectAll("g").data([source], d => d.id);

      if (source.height !== closedHeight) {
        const text = roots
          .append("text")
          .attr('class', 'content')
          .attr("y", -Math.floor(source.data.lines.length * 13.5 / 2 + 3))
          .attr("x", 6)
          .attr("text-anchor", 'start')
          .html(d => {
            const { name, content, lines } = d.data;
            return lines.map(line => {
              const offsetY = ((source.data.name || '').length + 2) * 8;
              return `<tspan x="${offsetY}" dx="0" dy="12">${line}</tspan>`;
            }).join('').trim();
          });

        // text.selectAll("tspan.text")
        //   .data(d => {
        //     console.log(d.data.lines);
        //     return d.data.lines;
        //   })
        //   .enter()
        //   .append("tspan")
        //   .attr("class", "text")
        //   .html(d => d)
        //   .attr("x", ((source.data.name || '').length + 2) * 8)
        //   .attr("dx", 0)
        //   .attr("dy", 12);

        text.clone(true).lower()
          .attr("stroke-linejoin", "round")
          .attr("stroke-width", 3)
          .attr("stroke", "white");
      } else {
        roots.selectAll('.content').remove();
      }

      // Compute the new tree layout.
      layout(root);

      root.each(n => {
        n.x += height / 2;
        n.y += width / 10;
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
          d.height = d.height === d._height ? closedHeight : d._height;
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
        .text(d => d.data.name);

      text.clone(true)
        .lower()
        .attr("stroke-linejoin", "round")
        .attr("stroke-width", 3)
        .attr("stroke", "white");

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
        .attr('stroke-width', 0.5)
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
