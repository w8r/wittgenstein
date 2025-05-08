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
    // clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    console.log(this.view);

    this.ctx.save();

    const w = this.canvas.width / 2;
    const h = this.canvas.height / 2;

    const matrix = this.view;
    const a = matrix[0]; // 0.015750402584671974
    const b = matrix[4]; // 0
    const c = matrix[1]; // 0
    const d = matrix[5]; // 0.01808168925344944
    const e = (matrix[12] + 1) * w; // -0.1664758026599884
    const f = (matrix[13] + 1) * h; // -0.2376861870288849
    this.ctx.setTransform(a, b, c, d, e, f);
    // set view matrix 4x4 view projection matrix
    // this.ctx.setTransform(
    //   this.view[0],
    //   -this.view[1],
    //   this.view[4],
    //   this.view[5],
    //   this.view[12],
    //   this.view[13]
    // );
    this.ctx.scale(w, -h); // flip y-axis
    //this.ctx.translate(0, -this.canvas.height); // translate to top left
    this.ctx.globalAlpha = 1.0;
    this.ctx.lineWidth = 1;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
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
