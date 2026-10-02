import { BaseRenderer } from './base';
import { LINK_STRIDE, NODE_STRIDE } from '../constants';

export class Renderer extends BaseRenderer {
  nodeData: Float32Array = new Float32Array(0);
  linkData: Float32Array = new Float32Array(0);
  view: Float32Array = new Float32Array(0);
  private context!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  static isSupported() {
    return true;
  }

  async init(viewProjMatrix: Float32Array) {
    this.view = viewProjMatrix;
    this.context = this.canvas.getContext('2d')!;
  }

  // debug renderer for canvas2d
  draw() {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    const ctx = this.context;

    // clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.save();

    // Reset transform to identity
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Move origin to center of canvas
    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    // Scale to map -1 to +1 range to -canvasWidth/2 to +canvasWidth/2 (and similar for height)
    // Also, flip Y axis because canvas Y is downwards.
    ctx.scale(canvasWidth / 2, -canvasHeight / 2);

    // Now, apply the view-projection matrix (assuming it transforms to -1 to +1 NDC space)
    // The ctx.transform() method multiplies the current transformation matrix by the matrix described by:
    // (a, b, c, d, e, f) which are m11, m12, m21, m22, dx, dy
    // If this.view is column-major: [m0, m1, m2, m3,  m4, m5, m6, m7,  m8, m9, m10, m11,  m12, m13, m14, m15]
    // m11 = view[0], m12 = view[1] (Y component of X-basis), m21 = view[4] (X component of Y-basis), m22 = view[5] (Y component of Y-basis), dx = view[12], dy = view[13]
    ctx.transform(
      this.view[0], // m11
      this.view[1], // m12
      this.view[4], // m21
      this.view[5], // m22
      this.view[12], // dx
      this.view[13] // dy
    );

    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 1;

    const data = this.nodeData;
    const linkData = this.linkData;
    const nodeCount = this.nodeCount;
    const linkCount = this.linkCount;

    {
      // draw links
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      for (let i = 0; i < linkCount; i++) {
        const offset = i * LINK_STRIDE; // Adjust if your linkData stride is different

        // Get source and target node positions
        const x0 = linkData[offset];
        const y0 = linkData[offset + 1];
        const x1 = linkData[offset + 2];
        const y1 = linkData[offset + 3];

        const cpx1 = linkData[offset + 4];
        const cpy1 = linkData[offset + 5];
        const cpx2 = linkData[offset + 6];
        const cpy2 = linkData[offset + 7];

        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x1, y1);
      }
      ctx.stroke();
    }

    {
      // draw nodes
      for (let i = 0; i < nodeCount; i++) {
        const offset = i * NODE_STRIDE;
        const x = data[offset];
        const y = data[offset + 1];
        const width = data[offset + 2];
        const height = data[offset + 3];
        const r = data[offset + 8];
        const g = data[offset + 9];
        const b = data[offset + 10];
        const a = data[offset + 11];

        // draw node
        ctx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
      }
    }

    {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let i = 0; i < nodeCount; i++) {
        const offset = i * NODE_STRIDE;
        const x = data[offset];
        const y = data[offset + 1] + data[offset + 3] / 2;
        ctx.moveTo(x, y);
        ctx.arc(x, y, 1, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    ctx.restore();
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width * window.devicePixelRatio;
    this.canvas.height = height * window.devicePixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  upload({
    nodeData,
    nodeCount,
    linkData,
    linkCount
  }: {
    nodeData: Float32Array;
    nodeCount: number;
    linkData: Float32Array;
    linkCount: number;
  }): void {
    this.nodeData = nodeData;
    this.nodeCount = nodeCount;
    this.linkData = linkData;
    this.linkCount = linkCount;
  }

  updateViewProj(viewProj: Float32Array): void {
    this.view = viewProj;
  }
}
