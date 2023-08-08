import { ZoomTransform } from "d3-zoom";
import { Datum } from "./types";
import { FlextreeNode } from "d3-flextree";
import { linkHorizontal } from "d3";

interface Options {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  transform: ZoomTransform;
  pxRatio: number;
  data: FlextreeNode<Datum>;
  pointer: { x: number; y: number };
  hoveredNode?: FlextreeNode<Datum>;
}

const MIN_FONT_SIZE = 8;

export function initCanvas() {
  const screenWidth = document.documentElement.clientWidth;
  const screenHeight = document.documentElement.clientHeight;

  const pxRatio = window.devicePixelRatio;

  const canvas = document.createElement("canvas")! as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  document.body.appendChild(canvas);

  canvas.style.width = screenWidth + "px";
  canvas.style.height = screenHeight + "px";

  // global width/height to use for rendering, accunting for retina screens
  const w = (canvas.width = screenWidth * devicePixelRatio);
  const h = (canvas.height = screenHeight * devicePixelRatio);
  return { canvas, ctx, w, h, pxRatio };
}

const R = 3;
const NODE_TEXT_OFFSET = 15;
const fontSize = 12;
const fontStyle = `${fontSize}px 'Roboto Slab', serif`;
// const fontStyle = `${fontSize}px serif`;

const diagonal = linkHorizontal<unknown, unknown, { x: number; y: number }>()
  .x((d) => d.y)
  .y((d) => d.x);

export function render({
  ctx,
  width,
  height,
  transform,
  pxRatio,
  data,
  pointer,
  hoveredNode,
}: Options) {
  // get viewport bounding box from event.transform
  const padding = 20;
  const xMin = (padding - pxRatio * transform.x) / transform.k;
  const yMin = (padding - pxRatio * transform.y) / transform.k;
  const xMax = (width - padding - pxRatio * transform.x) / transform.k;
  const yMax = (height - padding - pxRatio * transform.y) / transform.k;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  ctx.translate(transform.x * pxRatio, transform.y * pxRatio);
  ctx.scale(transform.k, transform.k);

  // draw viewport bounding box
  // ctx.strokeStyle = "#f00";
  // ctx.lineWidth = 10;
  // ctx.beginPath();
  // ctx.rect(xMin, yMin, xMax - xMin, yMax - yMin);
  // ctx.stroke();
  // ctx.closePath();

  // draw links
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const drawLink = diagonal.context(ctx);
  data.links().forEach((link) => {
    if (link.source.data.open && link.target.data.open) drawLink(link);
  });
  ctx.stroke();

  //ctx.beginPath();
  data.eachBefore(({ x: y, y: x, data }) => {
    //const { width, height, x: y0, y: x0 } = d;
    // check if node is fully inside viewport, x and y are reversed
    const x0 = x;
    const y0 = y - data.height / 2;
    const x1 = x0 + data.width + 100;
    const y1 = y0 + data.height;
    data.outside = x1 < xMin || x0 > xMax || y1 < yMin || y0 > yMax;
    //ctx.rect(x, y - data.height / 2, data.width + 100, data.height);
  });
  // ctx.stroke();
  // ctx.closePath();

  // draw nodes
  ctx.beginPath();
  data.eachBefore(({ x: y, y: x, data }) => {
    if (!data.open) return;
    ctx.moveTo(x + R, y);
    ctx.arc(x, y, R, 0, 2 * Math.PI, false);
  });
  ctx.closePath();
  ctx.fill();

  if (hoveredNode) {
    ctx.beginPath();
    ctx.fillStyle = "#f00";
    const { x: y, y: x } = hoveredNode;
    ctx.moveTo(x + R, y);
    ctx.arc(x, y, R, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.closePath();
  }

  // node stroke
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  data.eachBefore(({ x: y, y: x, data }) => {
    if (!data.open) return;
    ctx.moveTo(x + R, y);
    ctx.arc(x, y, R, 0, 2 * Math.PI, false);
    data.x0 = x;
    data.y0 = y;
  });
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.font = fontStyle;

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#000";
  data.eachBefore(({ data, x: y, y: x }) => {
    if (!data.open || data.outside) return;
    // title
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#000";
    ctx.textBaseline = "middle";

    if (data.name) {
      const titleX = x + R * 2;
      const titleY = y;
      //ctx.textBaseline = "bottom";
      ctx.strokeText(data.name, titleX, titleY);
      ctx.fillText(data.name, titleX, titleY);
    }

    const offsetX = ((data.name || "").length + 2) * 7;
    const offsetY = -Math.floor(((data.lines.length - 1) * fontSize) / 2);

    const scaledFontSize = fontSize * transform.k;

    // text bg
    if (scaledFontSize < MIN_FONT_SIZE) {
      ctx.beginPath();
      ctx.fillStyle = "#ccc";
      data.lines.forEach((line, i) => {
        // draw background rect
        const lineX = offsetX + x;
        const lineY = offsetY - (fontSize * 1.2) / 2 + y + i * fontSize;
        const lineW = ctx.measureText(line).width;
        const lineH = fontSize * 1.2;

        ctx.fillRect(lineX, lineY, lineW, lineH);
      });
      ctx.closePath();
    }

    if (scaledFontSize >= MIN_FONT_SIZE) {
      // text - conditionally draw if font size is readable
      ctx.beginPath();
      ctx.fillStyle = "#000";
      data.lines.forEach((line, i) => {
        const lineX = offsetX + x;
        const lineY = offsetY + y + i * fontSize;
        ctx.strokeText(line, lineX, lineY);
        ctx.fillText(line, lineX, lineY);
      });
    }
  });
  ctx.closePath();

  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#f00";
  ctx.moveTo(pointer.x + 10, pointer.y);
  ctx.arc(pointer.x, pointer.y, 10, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.closePath();

  ctx.restore();
}
