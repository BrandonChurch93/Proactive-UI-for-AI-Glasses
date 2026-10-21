import css from './chrome.module.css';

export class Chrome {
  readonly el: HTMLElement;
  private sound: HTMLButtonElement;
  private hint: HTMLButtonElement;
  private pace: HTMLElement;
  private pausedEl: HTMLElement;

  constructor(parent: HTMLElement, handlers: { sound(): boolean; inspector(): void }) {
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
    this.el.append(this.sound, this.hint, this.pace, this.pausedEl);
    parent.appendChild(this.el);
  }

  setInspectorHint(visible: boolean): void {
    this.hint.style.display = visible ? '' : 'none';
  }

  setPace(text: string | null): void {
    this.pace.style.display = text ? 'block' : 'none';
    if (text) this.pace.textContent = text;
  }

  setPaused(paused: boolean): void {
    this.pausedEl.style.display = paused ? 'block' : 'none';
  }
}
