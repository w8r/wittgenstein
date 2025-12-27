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
    nodeData: Float32Array;
    nodeCount: number;
    linkData: Float32Array;
    linkCount: number;
  }): void;

  public updateViewProj(viewProj: Float32Array): void {
    this.view = viewProj;
  }
}
