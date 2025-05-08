import { serializeTreeForGPU } from './buffers';
import { Camera } from './camera';
import { layout } from './layout';
import { Mouse } from './mouse';
import { Renderer } from './renderer/canvas';
import { Node } from './types';

export class Viewer {
  private renderer!: Renderer;
  private camera = new Camera();
  private mouse!: Mouse;
  private resizeObserver: ResizeObserver;
  private renderFrame: number = 0;

  private tree!: Node;

  constructor(private canvas: HTMLCanvasElement) {
    this.mouse = new Mouse(canvas, this.camera);
    this.mouse.on('update', this.requestRedraw);
    this.camera.zoom = 0.2;

    // Add ResizeObserver
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.updateSize(width, height);
      }
    });
    this.resizeObserver.observe(canvas);
    this.init();
  }

  requestRedraw = () => {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
    }
    this.renderFrame = requestAnimationFrame(this.redraw);
  };

  async init() {
    this.tree = (await fetch('data.json').then((response) =>
      response.json()
    )) as Node;
    if (Renderer.isSupported()) {
      this.renderer = new Renderer(this.canvas);
      await this.renderer.init(
        this.camera.getViewProjMatrix(this.getAspectRatio())
      );
    }
    const root = layout(this.tree);
    // Update renderer with the tree data
    if (this.tree && this.renderer) {
      const serializedData = serializeTreeForGPU(root);
      this.renderer.upload(serializedData);
    }
    this.updateSize();
  }

  updateSize(
    width = this.canvas.clientWidth,
    height = this.canvas.clientHeight
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.width = width;
    this.camera.height = height;
    if (this.renderer) {
      this.renderer.resize(width, height);
      this.redraw();
    }
  }

  private getAspectRatio() {
    return this.canvas.width / this.canvas.height;
  }

  private redraw = () => {
    const viewProj = this.camera.getViewProjMatrix(this.getAspectRatio());
    this.renderer.updateViewProj(viewProj);
    this.renderer.draw();
  };

  public destroy() {
    this.resizeObserver.disconnect();
    this.mouse.destroy();
    cancelAnimationFrame(this.renderFrame);
  }
}
