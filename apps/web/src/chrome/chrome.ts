import type { Rect } from '@lumen/shared';
import css from './chrome.module.css';

export class Chrome {
  readonly el: HTMLElement;
  private sound: HTMLButtonElement;
  private hint: HTMLButtonElement;
  private pace: HTMLElement;
  private pausedEl: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  readonly rotate: HTMLElement;
  private mark: HTMLElement;
  private markKey = '';
  private focusLabel: HTMLElement;

  constructor(parent: HTMLElement, handlers: { sound(): boolean; inspector(): void; pause(): boolean }, touch: boolean) {
    this.el = document.createElement('div');
    this.el.className = css.chrome!;
    this.sound = document.createElement('button');
    this.sound.type = 'button';
    this.sound.className = `${css.btn} ${css.sound}`;
    this.sound.setAttribute('aria-pressed', 'false');
    this.sound.textContent = 'Sound · off';
    this.sound.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = handlers.sound();
      this.sound.setAttribute('aria-pressed', String(on));
      this.sound.textContent = on ? 'Sound · on' : 'Sound · off';
      this.cache = null;
    });
    this.hint = document.createElement('button');
    this.hint.type = 'button';
    this.hint.className = `${css.btn} ${css.hint}`;
    this.hint.textContent = 'I · INSPECTOR';
    this.hint.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.inspector();
    });
    this.pace = document.createElement('div');
    this.pace.className = css.pace!;
    this.pausedEl = document.createElement('div');
    this.pausedEl.className = css.paused!;
    this.pausedEl.textContent = 'PAUSED · SPACE TO RESUME';
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = `${css.btn} ${css.pause}`;
    this.pauseBtn.textContent = 'Pause';
    this.pauseBtn.style.display = 'none';
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPaused(handlers.pause());
    });
    this.touch = touch;
    this.rotate = document.createElement('div');
    this.rotate.className = css.rotate!;
    this.rotate.setAttribute('role', 'alert');
    this.rotate.innerHTML = '<div><i></i><b>Turn your phone sideways</b><span>The glasses see the street wide, and so does this demo.</span></div>';
    this.mark = document.createElement('div');
    this.mark.className = css.mark!;
    this.mark.setAttribute('aria-hidden', 'true');
    const tick = '<svg viewBox="0 0 10 10"><path d="M0.75 10V6.75A6 6 0 0 1 6.75 0.75H10"/></svg>';
    this.mark.innerHTML = ['tl', 'tr', 'br', 'bl'].map((c) => `<i class="${css.corner} ${css[c]}">${tick}</i>`).join('') + `<span class="${css.focus}">FOCUS</span>`;
    this.focusLabel = this.mark.querySelector(`.${css.focus}`)!;
    this.el.append(this.mark, this.sound, this.pauseBtn, this.hint, this.pace, this.pausedEl, this.rotate);
    parent.appendChild(this.el);
    addEventListener('resize', () => (this.cache = null));
  }

  private touch: boolean;
  private cache: Rect[] | null = null;

  rects(): Rect[] {
    this.cache ??= [this.sound, this.pauseBtn, this.hint, this.pace]
      .filter((e) => e.style.display !== 'none' && e.offsetWidth > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      });
    return this.cache;
  }

  setInspectorHint(visible: boolean): void {
    this.hint.style.display = visible ? '' : 'none';
    this.pauseBtn.style.display = visible && this.touch ? '' : 'none';
    this.cache = null;
  }

  setRotate(on: boolean): void {
    this.rotate.style.display = on ? 'grid' : 'none';
  }

  setMark(state: { lit: boolean; p: number | null; label: boolean } | null): void {
    const key = state ? `${state.lit}|${state.p === null ? '-' : state.p.toFixed(3)}|${state.label}` : 'off';
    if (key === this.markKey) return;
    this.markKey = key;
    this.mark.style.display = state ? '' : 'none';
    if (!state) return;
    this.mark.classList.toggle(css.lit!, state.lit);
    this.mark.style.setProperty('--p', String(state.p ?? 0));
    this.focusLabel.classList.toggle(css.gone!, !state.label);
  }

  settleMark(): void {
    this.focusLabel.style.transition = 'none';
    void this.focusLabel.offsetWidth;
    this.focusLabel.style.transition = '';
  }

  setPace(text: string | null): void {
    const display = text ? 'block' : 'none';
    if (this.pace.style.display !== display) this.cache = null;
    this.pace.style.display = display;
    if (text) this.pace.textContent = text;
  }

  setPaused(paused: boolean): void {
    this.pausedEl.style.display = paused && !this.touch ? 'block' : 'none';
    this.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    this.pauseBtn.setAttribute('aria-pressed', String(paused));
  }
}
