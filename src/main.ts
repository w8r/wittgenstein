import { Viewer } from '.';
import './style.css';

const loader = document.getElementById('loader')!;
const loaderFill = loader.querySelector<HTMLElement>('.loader-fill')!;
const loaderLabel = loader.querySelector<HTMLElement>('.loader-label')!;

const viewer = new Viewer(document.getElementById('canvas') as HTMLCanvasElement, {
  onProgress: (fraction, label) => {
    loaderFill.style.transform = `scaleX(${fraction})`;
    if (label) loaderLabel.textContent = label;
    if (fraction >= 1) loader.classList.add('done');
  }
});

const actions: Record<string, () => void> = {
  'expand-all': () => viewer.expandAll(),
  'collapse-all': () => viewer.collapseAll(),
  center: () => viewer.center()
};
for (const control of document.querySelectorAll<HTMLElement>('[data-action]')) {
  control.addEventListener('click', () => actions[control.dataset.action!]?.());
}
