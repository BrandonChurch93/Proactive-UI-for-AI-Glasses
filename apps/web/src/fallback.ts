import css from './title/plate.module.css';

export function hasWebGL2(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export function mountFallback(root: HTMLElement): void {
  const el = document.createElement('section');
  el.className = css.plate!;
  el.innerHTML = `<div class="${css.text}"><h1 class="${css.name}">Proactive UI for AI Glasses</h1><p class="${css.subtitle}">A UX study in when an assistant should speak, and when it should stay quiet</p><p class="${css.note}">This demo needs a browser with WebGL 2.<br>Open it on a recent desktop browser, an iPad or a phone held sideways.</p></div>`;
  root.appendChild(el);
}
