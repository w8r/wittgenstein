import {
  linkHorizontal,
  tree as d3tree,
  create,
  event,
  zoom,
  zoomIdentity,
  quadtree as d3Quadtree,
  easeCubicInOut,
  timer as d3Timer
} from 'd3';
import { flextree } from 'd3-flextree';
//import { LayoutEngine } from '@textkit/core';
import textLayout from 'tex-linebreak';

const { layoutItemsFromString, breakLines, positionItems } = textLayout;

const width = document.documentElement.clientWidth;
const height = document.documentElement.clientHeight;
const dpx = devicePixelRatio;

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

// function clicked(d) {
//   const [[x0, y0], [x1, y1]] = path.bounds(d);
//   d3.event.stopPropagation();
//   svg.transition().duration(750).call(
//     zoom.transform,
//     d3.zoomIdentity
//       .translate(width / 2, height / 2)
//       .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
//       .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
//     d3.mouse(svg.node())
//   );
// }

const diagonal = linkHorizontal()
  .x(d => d.y)
  .y(d => d.x);

const fontSize = 11;
const fontStyle = `${fontSize}px 'Roboto Slab', serif`;
const closedHeight = 20;
let debug = false;

fetch('data/data.json')
  .then(r => r.json())
  .then(data => {
    data.name = '0';
    const layout = flextree({
      children: d => d.children,
      nodeSize: (d) => [d.height, d.width + 100]
    });
    const root = layout.hierarchy(data);
    root.each(n => {
      n.x += height / 2;
      n.y += width / 10;
    });

    let quadtree;

    root.x0 = dy / 2;
    root.y0 = 0;
    root.descendants().forEach((d, i) => {
      const text = (d.data.content || '').replace(/<\/?[^>]+>/g, '');
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

    const canvas = create('canvas')
      .attr('width', width * dpx)
      .attr('height', height * dpx)
      .style('width', width + 'px')
      .style('height', height + 'px');
    const ctx = canvas.node().getContext('2d');

    const svg = create('svg')
      .attr('viewBox', [0, 0, width, height])
      .attr('width', '100%')
      .attr('height', '100%')
      .style('font', '10px sans-serif')
      .style('user-select', 'none');

    const filter = svg
      .append('defs')
      .append('filter')
      .attr('id', 'whiteOutlineEffect');

    filter
      .append('feMorphology')
      .attr('in', 'SourceAlpha')
      .attr('result', 'MORPH')
      .attr('operator', 'dilate')
      .attr('radius', '2');
    filter
      .append('feColorMatrix')
      .attr('in', 'MORPH')
      .attr('result', 'WHITENED')
      .attr('type', 'matrix')
      .attr('values', '-1 0 0 1 0, 0 -1 0 1 0, 0 0 -1 1 0, 0 0 0 1 0');
    const merge = filter
      .append('feMerge');
    merge.append('feMergeNode').attr('in', 'WHITENED');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g');

    canvas.call(
      zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.01, 100])
        .on('zoom', () => zoomedCanvas(event.transform))
    );

    const transformation = zoomIdentity;
    const viewBox = [0, 0, 0, 0];
    function zoomedCanvas(transform) {
      const { x, y, k } = transform;

      transformation.x = x;
      transformation.y = y;
      transformation.k = k;

      viewBox[0] = transformation.invertX(0);
      viewBox[1] = transformation.invertY(0);
      viewBox[2] = transformation.invertX(width);
      viewBox[3] = transformation.invertY(height);

      requestAnimationFrame(render);
    }

    function render() {
      ctx.save();
      ctx.clearRect(0, 0, width * dpx, height * dpx);
      ctx.translate(transformation.x * dpx, transformation.y * dpx);
      ctx.scale(transformation.k * dpx, transformation.k * dpx);

      renderTree();

      ctx.restore();
    }

    const curves = linkHorizontal()
      .context(ctx)
      // invert
      .x(d => d.y)
      .y(d => d.x);


    let hoveredNode = null;
    function renderTree() {

      if (debug && quadtree) {
        ctx.beginPath();
        ctx.strokeStyle = 'red'
        ctx.lineWidth = 0.5;
        quadtree.visit((n, x0, y0, x1, y1) => {
          ctx.rect(x0, y0, x1 - x0, y1 - y0);
        });
        ctx.stroke();
      }

      // links
      ctx.beginPath();
      ctx.strokeStyle = '#555';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.75;
      root.links().forEach(curves);
      ctx.stroke();
      ctx.closePath();

      const nodes = root.descendants();

      // node circles
      ctx.beginPath();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#777';
      nodes.forEach(({ x, y }) => {
        ctx.moveTo(y, x);
        ctx.arc(y, x, 5, 0, 2 * Math.PI);
      });
      ctx.fill();

      const visibleNodes = nodes.filter(({ x, y }) => {
        return (x >= viewBox[1]
          && x <= viewBox[3]
          && y >= viewBox[0]
          && y <= viewBox[2]);
      });

      ctx.beginPath();
      ctx.font = fontStyle;
      ctx.fillStyle = '#222';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.textBaseline = 'middle';
      const titleOffsetX = 10;

      visibleNodes.forEach(({ data, x, y }) => {
        ctx.strokeText(data.name, y + titleOffsetX, x + 1);
        ctx.fillText(data.name, y + titleOffsetX, x + 1);
      });

      // texts
      const textsHidden = transformation.k < 0.5;
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.fillStyle = textsHidden ? '#ddd' : '#222';
      visibleNodes.forEach(({ data, x, y, children, height }) => {
        const { lines, name } = data;

        if (!children && height === closedHeight) return;

        const offsetY = -Math.floor(lines.length / 2) * 11 + 5;
        const offsetX = ((name || '').length + 2) * 8;
        let dy = x + offsetY;
        const dx = y + offsetX;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (textsHidden) {
            ctx.rect(dx, dy - (fontSize / 2), 200, fontSize);
          } else {
            ctx.strokeText(line, dx, dy);
            ctx.fillText(line, dx, dy);
          }
          dy += 12;
        }
        ctx.fill();
      });

      if (hoveredNode) {
        ctx.beginPath();
        ctx.moveTo(hoveredNode.y, hoveredNode.x);
        ctx.arc(hoveredNode.y, hoveredNode.x, 5, 0, 2 * Math.PI);
        ctx.fill();
        canvas.classed('hovered', true);
      } else {
        canvas.classed('hovered', false);
      }
    }

    //const render = () => requestAnimationFrame(_render);

    canvas
      .on('mousemove', () => {
        const x = transformation.invertX(event.x);
        const y = transformation.invertY(event.y);
        hoveredNode = quadtree.find(x, y, 5);
        requestAnimationFrame(render);
      })
      .on('click', () => {
        const x = transformation.invertX(event.x);
        const y = transformation.invertY(event.y);
        hoveredNode = quadtree.find(x, y, 5);
        const d = hoveredNode;
        if (d) {
          d.children = d.children ? null : d._children;
          //d.width = d.height === d._height ? lineWidth400;
          d.height = d.height === d._height ? closedHeight : d._height;
          update(d);

          if (d.children) {
            const x0 = d.x;
            const y0 = d.y;
            d.children.forEach(node => {
              node.x0 = node.x;
              node.y0 = node.y;
            });

            const t = d3Timer((elapsed) => {
              if (elapsed > 250) t.stop();
              else {
                const ratio = easeCubicInOut(elapsed / 250);
                d.children.forEach(node => {
                  node.x = x0 + ratio * (node.x0 - x0);
                  node.y = y0 + ratio * (node.y0 - y0);
                });
                render();
              }
            }, 150);
          }
        }
      });


    svg.call(
      zoom()
        .extent([
          [0, 0],
          [width, height]
        ])
        .scaleExtent([0.1, 8])
        .on('zoom', zoomed)
    );

    function zoomed() {
      g.attr('transform', event.transform);
    }

    const gLink = g
      .append('g')
      .attr('fill', 'none')
      .attr('stroke', '#555')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1.5);

    const gNode = g
      .append('g')
      .attr('cursor', 'pointer')
      .attr('pointer-events', 'all');

    function update(source) {
      const duration = event && event.altKey ? 2500 : 250;
      const nodes = root.descendants().reverse();
      const links = root.links();

      const roots = gNode.selectAll('g').data([source], d => d.id);

      if (source.height !== closedHeight) {
        const text = roots
          .append('text')
          .attr('class', 'content')
          .attr('y', -Math.floor(source.data.lines.length * 13.5 / 2 + 3))
          .attr('x', 6)
          .attr('text-anchor', 'start')
          //.attr('filter', 'url(#whiteOutlineEffect)')
          .html(d => {
            const { lines } = d.data;
            const offsetX = ((source.data.name || '').length + 2) * 8;
            return lines.map(line => `
              <tspan x="${offsetX}" dx="0" dy="12">${line}</tspan>
            `).join('').trim();
          });

        text.clone(true).lower()
          .attr('stroke-linejoin', 'round')
          .attr('stroke-width', 3)
          .attr('stroke', 'white');
      } else {
        roots.selectAll('.content').remove();
      }

      // Compute the new tree layout.
      layout(root);
      root.each(n => {
        n.x += height / 2;
        n.y += width / 10;
      });

      quadtree = d3Quadtree(nodes, d => d.y, d => d.x);



      const transition = g
        .transition()
        .duration(duration)
        .tween(
          'resize',
          window.ResizeObserver ? null : () => () => svg.dispatch('toggle')
        );

      // Update the nodes…
      const node = gNode.selectAll('g.node').data(nodes, d => d.id);
      // Enter any new nodes at the parent's previous position.
      const nodeEnter = node
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('id', d => `node-${d.data.name.replace(/\./g, '')}`)
        .attr('transform', d => `translate(${source.y0},${source.x0})`)
        .attr('fill-opacity', 0)
        .attr('stroke-opacity', 0)
        .on('click', d => {
          d.children = d.children ? null : d._children;
          //d.width = d.height === d._height ? lineWidth400;
          d.height = d.height === d._height ? closedHeight : d._height;
          update(d);
        });

      const icon = nodeEnter
        .append('g')
        .attr('transform', 'scale(0.5), translate(-12, -12)')
        .attr('class', 'icon');

      icon
        .append('path')
        .attr('d', 'M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm6 13h-5v5h-2v-5h-5v-2h5v-5h2v5h5v2z');

      const nodeExit = node
        .exit()
        .transition(transition)
        .remove()
        .attr('transform', d => `translate(${source.y},${source.x})`)
        .attr('fill-opacity', 0)
        .attr('stroke-opacity', 0);

      root.eachBefore(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
      //render();
    }

    update(root);

    //document.body.appendChild(svg.node());
    document.body.appendChild(canvas.node());
    zoomedCanvas(transformation);

    const controls = create('div')
      .attr('class', 'controls');

    document.body.appendChild(controls.node());

    controls
      .append('div')
      .attr('class', 'link-control')
      .text('expand all')
      .on('click', () => {
        root.each(n => {
          n.children = n._children;
          n.height = n._height;
        });

        update(root);
      });

    controls
      .append('div')
      .attr('class', 'link-control')
      .text('collapse all')
      .on('click', () => {
        root.each(n => {
          n.children = null;
          n.height = closedHeight;
        });
        update(root);
      });
  });
