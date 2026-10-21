import css from './plate.module.css';

export function mountPlate(root: HTMLElement): HTMLElement {
  const el = document.createElement('section');
  el.className = css.plate!;
  el.innerHTML = `<div class="${css.text}"><h1 class="${css.name}">Proactive UI for AI Glasses</h1><p class="${css.subtitle}">A UX study in when an assistant should speak, and when it should stay quiet</p></div>`;
  root.appendChild(el);
  return el;
}
