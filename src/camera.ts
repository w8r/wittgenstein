import { Point } from './types';

/**
 * 2D camera: the world point at the center of the canvas and the zoom
 * (world units per CSS pixel). Driven by d3-zoom, see controls.ts.
 */
export class Camera {
  position: Point = { x: 0, y: 0 };
  zoom: number = 1;
  width: number = 0;
  height: number = 0;
  maxZoom: number = 1e3;
  minZoom: number = 1e-3;

  /** Converts canvas CSS pixel coordinates to world coordinates. */
  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: this.position.x + (screenX - this.width / 2) * this.zoom,
      y: this.position.y - (screenY - this.height / 2) * this.zoom
    };
  }

  /**
   * View-projection matrix: one world unit spans 1 / zoom CSS pixels in both
   * directions, matching `screenToWorld` in landscape and portrait alike.
   */
  getViewProjMatrix(): Float32Array<ArrayBuffer> {
    const sx = 2 / (this.zoom * Math.max(this.width, 1));
    const sy = 2 / (this.zoom * Math.max(this.height, 1));
    // prettier-ignore
    return new Float32Array([
      sx,                     0,                      0, 0,
      0,                      sy,                     0, 0,
      0,                      0,                      1, 0,
      -this.position.x * sx,  -this.position.y * sy,  0, 1
    ]);
  }
}
