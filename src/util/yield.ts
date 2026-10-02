/**
 * Returns a function that yields to the browser (letting it paint) once
 * more than `budgetMs` of synchronous work has passed since the last yield.
 */
export function createYielder(budgetMs = 12) {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < budgetMs) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    last = performance.now();
  };
}

export type ProgressCallback = (fraction: number) => void;
