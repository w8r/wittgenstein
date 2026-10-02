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
    by: 'by'
  },
  de: {
    title: 'Logisch-philosophische Abhandlung (1921)',
    by: 'von'
  }
};

let language: Language = new URLSearchParams(location.search).get('lang') === 'de' ? 'de' : 'en';

function applyLanguage() {
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = STRINGS[language][element.dataset.i18n!];
  }
  for (const button of document.querySelectorAll<HTMLElement>('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
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
  },
  onUnsupported: () => {
    loader.classList.add('done');
    document.getElementById('unsupported')!.hidden = false;
  }
});
applyLanguage();

// --- Menu: floating action button (FAB) that opens the controls ----------

const menu = document.getElementById('menu')!;
const menuToggle = menu.querySelector<HTMLButtonElement>('.menu-toggle')!;

function setMenuOpen(open: boolean) {
  menu.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
}

menuToggle.addEventListener('click', () => setMenuOpen(!menu.classList.contains('open')));
// Close on a tap or click anywhere else, or on Escape
document.addEventListener('pointerdown', (event) => {
  if (!menu.contains(event.target as Node)) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.classList.contains('open')) {
    setMenuOpen(false);
    menuToggle.focus();
  }
});

const actions: Record<string, () => void> = {
  'expand-all': () => viewer.expandAll(),
  'collapse-all': () => viewer.collapseAll(),
  center: () => viewer.center()
};
for (const control of document.querySelectorAll<HTMLElement>('[data-action]')) {
  control.addEventListener('click', () => {
    actions[control.dataset.action!]?.();
    setMenuOpen(false);
  });
}
// The language switch keeps the menu open, so the change can be seen
for (const button of document.querySelectorAll<HTMLElement>('[data-language]')) {
  button.addEventListener('click', () => {
    language = button.dataset.language as Language;
    viewer.setLanguage(language);
    applyLanguage();
  });
}
