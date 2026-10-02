import { Viewer } from '.';
import './style.css';
import type { Language } from './types';

const loader = document.getElementById('loader')!;
const loaderFill = loader.querySelector<HTMLElement>('.loader-fill')!;
const loaderLabel = loader.querySelector<HTMLElement>('.loader-label')!;

/** Page text per language; `data-i18n` elements show the matching entry */
const STRINGS: Record<Language, Record<string, string>> = {
  en: {
    title: 'Tractatus Logico-Philosophicus (1922)',
    by: 'by',
    language: 'deutsch'
  },
  de: {
    title: 'Logisch-philosophische Abhandlung (1921)',
    by: 'von',
    language: 'english'
  }
};

let language: Language =
  new URLSearchParams(location.search).get('lang') === 'de' ? 'de' : 'en';

function applyLanguage() {
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = STRINGS[language][element.dataset.i18n!];
  }
  // Keep the language in the URL so shared links open in it
  const url = new URL(location.href);
  if (language === 'de') url.searchParams.set('lang', 'de');
  else url.searchParams.delete('lang');
  history.replaceState(history.state, '', url);
}

const viewer = new Viewer(document.getElementById('canvas') as HTMLCanvasElement, {
  language,
  onProgress: (fraction, label) => {
    loaderFill.style.transform = `scaleX(${fraction})`;
    if (label) loaderLabel.textContent = label;
    if (fraction >= 1) loader.classList.add('done');
  }
});
applyLanguage();

const actions: Record<string, () => void> = {
  'expand-all': () => viewer.expandAll(),
  'collapse-all': () => viewer.collapseAll(),
  center: () => viewer.center(),
  language: () => {
    language = language === 'en' ? 'de' : 'en';
    viewer.setLanguage(language);
    applyLanguage();
  }
};
for (const control of document.querySelectorAll<HTMLElement>('[data-action]')) {
  control.addEventListener('click', () => actions[control.dataset.action!]?.());
}
