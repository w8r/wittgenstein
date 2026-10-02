import { Point } from './types';

export class Camera {
  position: Point = { x: 0, y: 0 };
  zoom: number = 1;
  width: number = 0;
  height: number = 0;
  maxZoom: number = 1e3;
  minZoom: number = 1e-3;

  zoomAroundPoint(zoomFactor: number, screenX: number, screenY: number) {
    // Compute and clamp the proposed new zoom level
    const newZoom = Math.max(
      this.minZoom,
      Math.min(this.maxZoom, this.zoom * zoomFactor)
    );

    // Convert the screen point to world coordinates
    const worldX = this.position.x + (screenX - this.width / 2) * this.zoom;
    const worldY = this.position.y - (screenY - this.height / 2) * this.zoom;

    // Adjust the camera position to keep the world point under the mouse cursor
    const zoomRatio = newZoom / this.zoom;
    this.position.x = worldX - (worldX - this.position.x) * zoomRatio;
    this.position.y = worldY - (worldY - this.position.y) * zoomRatio;

    // Update the zoom
    this.zoom = newZoom;
  }

  move(dx: number, dy: number) {
    this.position.x -= dx * this.zoom;
    this.position.y -= dy * this.zoom;
  }

  /** Centers the camera on a world-space rectangle and zooms to fit it. */
  fitBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    padding = 1.1
  ) {
    this.position.x = (minX + maxX) / 2;
    this.position.y = (minY + maxY) / 2;
    // zoom = world units per screen pixel
    this.zoom = Math.max(
      this.minZoom,
      Math.min(
        this.maxZoom,
        Math.max(
          ((maxX - minX) * padding) / Math.max(this.width, 1),
          ((maxY - minY) * padding) / Math.max(this.height, 1)
        )
      )
    );
  }

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

  debugState() {
    console.log('Camera State:', {
      position: this.position,
      zoom: this.zoom,
      width: this.width,
      height: this.height
    });
  }
}
