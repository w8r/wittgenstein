import { ZoomTransform } from "d3-zoom";
import { Datum } from "./types";
import { FlextreeNode } from "d3-flextree";
import { linkHorizontal, pointer } from "d3";

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
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(transform.x * pxRatio, transform.y * pxRatio);
  ctx.scale(transform.k, transform.k);

  // draw links
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const drawLink = diagonal.context(ctx);
  data.links().forEach((link) => {
    if (link.source.data.open && link.target.data.open) drawLink(link);
  });
  ctx.stroke();

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

  let i = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#000";
  data.eachBefore(({ data, x: y, y: x }) => {
    if (!data.open) return;
    if (i++ > 40) return;
    // title
    if (data.name) {
      const titleX = x + R * 2;
      const titleY = y;
      //ctx.textBaseline = "bottom";
      ctx.strokeText(data.name, titleX, titleY);
      ctx.fillText(data.name, titleX, titleY);
    }

    // content
    ctx.textBaseline = "middle";
    const offsetX = ((data.name || "").length + 2) * 7;
    const offsetY = -Math.floor(((data.lines.length - 1) * fontSize) / 2);
    data.lines.forEach((line, i) => {
      const lineX = offsetX + x;
      const lineY = offsetY + y + i * fontSize;
      ctx.strokeText(line, lineX, lineY);
      ctx.fillText(line, lineX, lineY);
    });
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
