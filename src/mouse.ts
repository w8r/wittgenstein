import { Camera } from './camera';
import { EventEmitter } from 'eventemitter3';
import { Point } from './types';

/** Pointer travel (CSS px) below which a press counts as a tap/click, not a drag */
const CLICK_TOLERANCE = 6;

export type PointerKind = 'mouse' | 'touch' | 'pen';

/** Safari's proprietary pinch/rotate gesture events */
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'];

const preventDefault = (event: Event) => event.preventDefault();

/**
 * Camera controls and taps for mouse, touch and pen (Pointer Events):
 * drag to pan, wheel or two-finger pinch to zoom.
 */
export class Mouse extends EventEmitter<{
  /** Camera moved or zoomed by the user */
  update: [];
  /** User started moving the camera (cancels camera animations) */
  interact: [];
  /** Mouse moved over the canvas (null when it left) */
  hover: [Point | null];
  /** Tap or click without dragging */
  click: [Point, PointerKind];
}> {
  /** Active pointers (fingers or buttons down), canvas CSS px */
  private pointers = new Map<number, Point>();
  private downPoint: Point = { x: 0, y: 0 };
  /** The current gesture moved the camera (so it isn't a click) */
  private moved = false;
  /** Distance between two pinching fingers at the previous move */
  private pinchDistance = 0;
  private devicePixelRatio: number = window.devicePixelRatio || 1;

  constructor(private canvas: HTMLCanvasElement, private camera: Camera) {
    super();
    // Pan/zoom gestures are handled here, not by the browser
    canvas.style.touchAction = 'none';
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
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.updateCameraDimensions();
  };

  private setupEventHandlers() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // The app handles pan and zoom itself: stop the browser's own touch
    // scrolling and page pinch-zoom (iOS Safari also needs its gesture events
    // cancelled), otherwise the page zooms and taps land in the wrong place
    this.canvas.addEventListener('touchstart', preventDefault, { passive: false });
    this.canvas.addEventListener('touchmove', preventDefault, { passive: false });
    for (const type of GESTURE_EVENTS) {
      document.addEventListener(type, preventDefault, { passive: false });
    }
  }

  private getCanvasPosition(event: MouseEvent): Point {
    // Read fresh: on phones the page can shift without a resize event
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  /** Midpoint and spread of the two pinching pointers */
  private pinch() {
    const [a, b] = [...this.pointers.values()];
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y)
    };
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.getCanvasPosition(event);
    this.pointers.set(event.pointerId, point);

    if (this.pointers.size === 1) {
      this.downPoint = point;
      this.moved = false;
    } else if (this.pointers.size === 2) {
      // Second finger: start pinching
      this.moved = true;
      this.pinchDistance = this.pinch().distance;
      this.emit('interact');
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    const point = this.getCanvasPosition(event);
    const previous = this.pointers.get(event.pointerId);

    if (!previous) {
      if (event.pointerType === 'mouse') this.emit('hover', point);
      return;
    }

    if (this.pointers.size === 1) {
      if (
        !this.moved &&
        Math.hypot(point.x - this.downPoint.x, point.y - this.downPoint.y) <
          CLICK_TOLERANCE
      ) {
        return;
      }
      if (!this.moved) {
        this.moved = true;
        this.canvas.style.cursor = 'grabbing';
        this.emit('interact');
      }
      this.pointers.set(event.pointerId, point);
      this.camera.move(point.x - previous.x, previous.y - point.y);
      this.emit('update');
      return;
    }

    // Two (or more) pointers: pan with the midpoint, zoom with the spread
    const before = this.pinch();
    this.pointers.set(event.pointerId, point);
    const after = this.pinch();
    this.camera.move(after.center.x - before.center.x, before.center.y - after.center.y);
    if (after.distance > 0 && this.pinchDistance > 0) {
      this.camera.zoomAroundPoint(
        this.pinchDistance / after.distance,
        after.center.x,
        after.center.y
      );
    }
    this.pinchDistance = after.distance;
    this.emit('update');
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) {
      this.canvas.style.cursor = '';
      if (!this.moved) {
        this.emit('click', this.getCanvasPosition(event), event.pointerType as PointerKind);
      }
    }
  };

  private onPointerCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) this.canvas.style.cursor = '';
  };

  private onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && !this.pointers.size) this.emit('hover', null);
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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('touchstart', preventDefault);
    this.canvas.removeEventListener('touchmove', preventDefault);
    for (const type of GESTURE_EVENTS) {
      document.removeEventListener(type, preventDefault);
    }
    window.removeEventListener('resize', this.updateRect);
  }
}
