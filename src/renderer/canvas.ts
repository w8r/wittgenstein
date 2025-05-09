import { Renderer as BaseRenderer } from '.';

export class Renderer extends BaseRenderer {
  nodeData: Float32Array = new Float32Array(0);
  linkData: Float32Array = new Float32Array(0);
  view: Float32Array = new Float32Array(0);
  private ctx!: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

  async init(viewProjMatrix: Float32Array) {
    this.view = viewProjMatrix;
    this.ctx = this.canvas.getContext('2d')!;
  }

  // debug renderer for canvas2d
  draw() {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // clear canvas
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.save();

    // Reset transform to identity
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Move origin to center of canvas
    this.ctx.translate(canvasWidth / 2, canvasHeight / 2);

    // Scale to map -1 to +1 range to -canvasWidth/2 to +canvasWidth/2 (and similar for height)
    // Also, flip Y axis because canvas Y is downwards.
    this.ctx.scale(canvasWidth / 2, -canvasHeight / 2);

    // Now, apply the view-projection matrix (assuming it transforms to -1 to +1 NDC space)
    // The ctx.transform() method multiplies the current transformation matrix by the matrix described by:
    // (a, b, c, d, e, f) which are m11, m12, m21, m22, dx, dy
    // If this.view is column-major: [m0, m1, m2, m3,  m4, m5, m6, m7,  m8, m9, m10, m11,  m12, m13, m14, m15]
    // m11 = view[0], m12 = view[1] (Y component of X-basis), m21 = view[4] (X component of Y-basis), m22 = view[5] (Y component of Y-basis), dx = view[12], dy = view[13]
    this.ctx.transform(
      this.view[0], // m11
      this.view[1], // m12
      this.view[4], // m21
      this.view[5], // m22
      this.view[12], // dx
      this.view[13] // dy
    );

    this.ctx.globalAlpha = 1.0;
    this.ctx.lineWidth = 1;

    // draw nodes
    for (let i = 0; i < this.nodeCount; i++) {
      const offset = i * 12;
      const x = this.nodeData[offset];
      const y = this.nodeData[offset + 1];
      const width = this.nodeData[offset + 2];
      const height = this.nodeData[offset + 3];
      const r = this.nodeData[offset + 8];
      const g = this.nodeData[offset + 9];
      const b = this.nodeData[offset + 10];
      const a = this.nodeData[offset + 11];

      // draw node
      this.ctx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
      this.ctx.fillRect(x, y, width, height);
      this.ctx.strokeStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
      this.ctx.strokeRect(x, y, width, height);
    }
    this.ctx.restore();
  }

  public resize(width: number, height: number): void {}

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
