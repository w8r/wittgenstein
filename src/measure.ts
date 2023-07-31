const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d")!;

offscreenCanvas.width = offscreenCanvas.height = 5;

export function measureText(text: string, fontStyle: string) {
  offscreenCtx.font = fontStyle;
  return offscreenCtx.measureText(text).width;
}
