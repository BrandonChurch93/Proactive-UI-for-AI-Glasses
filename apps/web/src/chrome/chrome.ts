import css from './chrome.module.css';

export class Chrome {
  readonly el: HTMLElement;
  private sound: HTMLButtonElement;
  private hint: HTMLButtonElement;
  private pace: HTMLElement;
  private pausedEl: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  readonly rotate: HTMLElement;

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
    this.el.append(this.sound, this.pauseBtn, this.hint, this.pace, this.pausedEl, this.rotate);
    parent.appendChild(this.el);
  }

  private touch: boolean;

  setInspectorHint(visible: boolean): void {
    this.hint.style.display = visible ? '' : 'none';
    this.pauseBtn.style.display = visible && this.touch ? '' : 'none';
  }

  setRotate(on: boolean): void {
    this.rotate.style.display = on ? 'grid' : 'none';
  }

  setPace(text: string | null): void {
    this.pace.style.display = text ? 'block' : 'none';
    if (text) this.pace.textContent = text;
  }

  setPaused(paused: boolean): void {
    this.pausedEl.style.display = paused && !this.touch ? 'block' : 'none';
    this.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    this.pauseBtn.setAttribute('aria-pressed', String(paused));
  }
}
