import { Camera } from './camera';
import { EventEmitter } from 'eventemitter3';
import { Point } from './types';

/** Pointer travel (CSS px) below which a press counts as a click, not a drag */
const CLICK_TOLERANCE = 4;

export class Mouse extends EventEmitter<{
  /** Camera moved or zoomed by the user */
  update: [];
  /** User started moving the camera (cancels camera animations) */
  interact: [];
  /** Pointer moved over the canvas (null when it left) */
  hover: [Point | null];
  click: [Point];
}> {
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private rect!: DOMRect;
  private devicePixelRatio: number = window.devicePixelRatio || 1;

  constructor(private canvas: HTMLCanvasElement, private camera: Camera) {
    super();
    this.setupEventHandlers();
    this.updateRect();

    this.updateCameraDimensions();

    window.addEventListener('resize', this.updateRect);
  }

  updateCameraDimensions() {
    this.camera.width = this.canvas.width / this.devicePixelRatio;
    this.camera.height = this.canvas.height / this.devicePixelRatio;
  }

  private updateRect = () => {
    this.rect = this.canvas.getBoundingClientRect();
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.updateCameraDimensions();
  };

  private setupEventHandlers() {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private setXY(event: MouseEvent) {
    const { x, y } = this.getCanvasPosition(event);
    this.lastMouseX = x;
    this.lastMouseY = y;
  }

  private getCanvasPosition(event: MouseEvent | WheelEvent): Point {
    const rect = this.rect;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private onMouseDown = (event: MouseEvent) => {
    this.isDragging = true;
    this.moved = false;
    this.setXY(event);
    this.downX = this.lastMouseX;
    this.downY = this.lastMouseY;
  };

  private onMouseMove = (event: MouseEvent) => {
    const { x, y } = this.getCanvasPosition(event);

    if (!this.isDragging) {
      this.setXY(event);
      if (event.target === this.canvas) this.emit('hover', { x, y });
      return;
    }

    if (
      !this.moved &&
      Math.hypot(x - this.downX, y - this.downY) < CLICK_TOLERANCE
    ) {
      return;
    }
    if (!this.moved) {
      this.moved = true;
      this.canvas.style.cursor = 'grabbing';
      this.emit('interact');
    }

    const dx = x - this.lastMouseX;
    const dy = y - this.lastMouseY;

    this.camera.move(dx, -dy);

    this.setXY(event);
    this.emit('update');
  };

  private onMouseUp = (event: MouseEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.canvas.style.cursor = '';
    if (!this.moved) this.emit('click', this.getCanvasPosition(event));
  };

  private onMouseLeave = () => {
    if (!this.isDragging) this.emit('hover', null);
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.emit('interact');

    const { x, y } = this.getCanvasPosition(event);

    const zoomFactor = 1 + event.deltaY * 0.01;
    this.camera.zoomAroundPoint(zoomFactor, x, y);
    this.emit('update');
  };

  destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.updateRect);
  }
}
