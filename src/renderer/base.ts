export abstract class BaseRenderer {
  protected view: Float32Array = new Float32Array(0);
  protected nodeCount: number = 0;
  protected linkCount: number = 0;

  constructor(protected canvas: HTMLCanvasElement) {}

  public async init(viewProjMatrix: Float32Array) {
    this.view = viewProjMatrix;
  }

  // debug renderer for canvas2d
  abstract draw(): void;

  public abstract resize(width: number, height: number): void;

  abstract upload(data: {
    nodeData: Float32Array<ArrayBuffer>;
    nodeCount: number;
    linkData: Float32Array<ArrayBuffer>;
    linkCount: number;
    glyphData?: Float32Array<ArrayBuffer>; // Optional for graceful migration
    glyphCount?: number;
  }): void;

  public updateViewProj(viewProj: Float32Array): void {
    this.view = viewProj;
  }
}
