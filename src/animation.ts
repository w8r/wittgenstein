export const quadIn = (t: number) => t * t;
export const quadOut = (t: number) => t * (2 - t);
export const quadInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export function animate(
  duration: number,
  callback: (t: number) => void,
  easing = quadOut
) {
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      callback(easing(t));
      if (t < 1) return requestAnimationFrame(tick);
      resolve();
    };
    tick();
  });
}
