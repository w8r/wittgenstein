import { nodeRect, serializeTreeForGPU, serializeTextForGPU } from './buffers';
import { Camera } from './camera';
import { layout, typesetTree } from './layout';
import { Mouse } from './mouse';
import { Renderer } from './renderer/webgpu';
import { Typesetter } from './text/typesetter';
import { Node } from './types';

export class Viewer {
  private renderer!: Renderer;
  private camera = new Camera();
  private mouse!: Mouse;
  private resizeObserver: ResizeObserver;
  private renderFrame: number = 0;

  private tree!: Node;
  private typesetter?: Typesetter;

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
    // Initialize renderer first
    if (Renderer.isSupported()) {
      this.renderer = new Renderer(this.canvas);
      await this.renderer.init(
        this.camera.getViewProjMatrix(this.getAspectRatio())
      );
    }

    const [tree, typesetter] = await Promise.all([
      fetch('data.json').then((response) => response.json() as Promise<Node>),
      Typesetter.load().catch((error) => {
        console.error('Failed to load fonts, rendering without text:', error);
        return undefined;
      })
    ]);
    this.tree = tree;
    this.typesetter = typesetter;

    // Typeset all propositions, then generate the glyph atlas once
    if (typesetter) {
      typesetTree(this.tree, typesetter);
      const atlas = typesetter.buildAtlas();
      this.renderer?.initTextRendering(atlas);
    }

    const root = this.updateBuffers();
    this.updateSize();

    // Open on the proposition named in the URL hash (e.g. #4.1252), or on 1
    const focusId = decodeURIComponent(location.hash.slice(1)) || '1';
    const focus =
      root?.descendants().find((node) => node.data.data?.id === focusId) ??
      root?.children?.[0];
    if (focus) {
      const r = nodeRect(focus);
      this.camera.fitBounds(r.x, r.y, r.x + r.width, r.y + r.height, 3);
      this.redraw();
    }
  }

  /** Recomputes the layout and uploads all GPU buffers. */
  private updateBuffers() {
    if (!this.renderer) return;
    const root = layout(this.tree);
    this.renderer.upload({
      ...serializeTreeForGPU(root),
      ...(this.typesetter ? serializeTextForGPU(root, this.typesetter) : {})
    });
    return root;
  }

  updateSize(
    width = this.canvas.clientWidth,
    height = this.canvas.clientHeight
  ) {
    // Render at device resolution; the camera works in CSS pixels
    const dpr = window.devicePixelRatio || 1;
    const deviceWidth = Math.max(1, Math.round(width * dpr));
    const deviceHeight = Math.max(1, Math.round(height * dpr));
    this.camera.width = width;
    this.camera.height = height;
    if (this.renderer) {
      this.renderer.resize(deviceWidth, deviceHeight);
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
