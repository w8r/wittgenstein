const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

offscreenCanvas.width = offscreenCanvas.height = 5;

export default function measureText (text, fontStyle) {
  console.log(text);
  offscreenCtx.font = fontStyle;
  return offscreenCtx.measureText(text).width;
}
