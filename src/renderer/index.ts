import { TreeNode } from '../types';

export class Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private viewProjBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private quadBuffer!: GPUBuffer;
  private lineBuffer!: GPUBuffer;
  private depthTexture!: GPUTexture;

  private combinedBuffer!: GPUBuffer;
  private combinedBufferSize!: number;

  constructor(private canvas: HTMLCanvasElement, private tree: TreeNode) {}

  private createViewProjBuffer(view: Float32Array) {
    this.viewProjBuffer = this.device.createBuffer({
      size: view.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.viewProjBuffer.getMappedRange()).set(view);
    this.viewProjBuffer.unmap();
  }

  public resize(width: number, height: number) {
    // Update context configuration
    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied'
    });
  }

  public updateViewProj(matrix: Float32Array) {
    this.device.queue.writeBuffer(this.viewProjBuffer, 0, matrix);
  }
}
