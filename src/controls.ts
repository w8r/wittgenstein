import { select, type Selection } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { Camera } from './camera';
import { Point } from './types';

export type PointerKind = 'mouse' | 'touch' | 'pen';

/** World point at the center of the screen, and world units per CSS pixel */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Safari's proprietary pinch/rotate gesture events */
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'];
const preventDefault = (event: Event) => event.preventDefault();

/**
 * Canvas input: pan and zoom (drag, wheel, trackpad and touch pinch) via
 * d3-zoom, which drives the camera; plus hover and click/tap events.
 *
 * d3-zoom works in screen space (y down) while the camera is in world space
 * (y up): `toCamera` and `toTransform` convert between the two.
 */
export class Controls {
  private zoom: ZoomBehavior<HTMLCanvasElement, unknown>;
  private selection: Selection<HTMLCanvasElement, unknown, null, undefined>;
  /** Pointer type of the last press, for the click that follows it */
  private pointerKind: PointerKind = 'mouse';

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private handlers: {
      /** The camera moved (user gesture or animation) */
      change: () => void;
      /** Mouse over the canvas (null when it left) */
      hover: (point: Point | null) => void;
      /** Click or tap without dragging */
      click: (point: Point, pointer: PointerKind) => void;
    }
  ) {
    this.zoom = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1 / camera.maxZoom, 1 / camera.minZoom])
      .on('zoom', ({ transform }) => {
        this.toCamera(transform);
        handlers.change();
      });
    this.selection = select(canvas);
    // Double click/tap zooming would fight with click-to-expand
    this.selection.call(this.zoom).on('dblclick.zoom', null);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('click', this.onClick);
    // Keep Safari from pinch-zooming the page instead of the tree
    for (const type of GESTURE_EVENTS) {
      document.addEventListener(type, preventDefault, { passive: false });
    }
  }

  /** Moves the camera, animated with d3's smooth zoom interpolation */
  moveTo(state: CameraState, duration = 0) {
    const transform = this.toTransform(state);
    if (duration > 0) {
      this.selection.transition().duration(duration).call(this.zoom.transform, transform);
    } else {
      this.selection.interrupt().call(this.zoom.transform, transform);
    }
  }

  /** Re-applies the camera after a canvas resize, keeping its center */
  sync() {
    this.moveTo({ ...this.camera.position, zoom: this.camera.zoom });
  }

  private toTransform({ x, y, zoom }: CameraState): ZoomTransform {
    const k = 1 / zoom;
    return zoomIdentity
      .translate(this.camera.width / 2 - x * k, this.camera.height / 2 + y * k)
      .scale(k);
  }

  private toCamera(transform: ZoomTransform) {
    const { k, x, y } = transform;
    this.camera.zoom = 1 / k;
    this.camera.position = {
      x: (this.camera.width / 2 - x) / k,
      y: -(this.camera.height / 2 - y) / k
    };
  }

  private position(event: MouseEvent): Point {
    // Read fresh: on phones the page can shift without a resize event
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointerKind = event.pointerType as PointerKind;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && !event.buttons) {
      this.handlers.hover(this.position(event));
    }
  };

  private onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.handlers.hover(null);
  };

  /** d3-zoom suppresses the click that ends a drag */
  private onClick = (event: MouseEvent) => {
    this.handlers.click(this.position(event), this.pointerKind);
  };

  destroy() {
    this.selection.interrupt().on('.zoom', null);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
    for (const type of GESTURE_EVENTS) {
      document.removeEventListener(type, preventDefault);
    }
  }
}
