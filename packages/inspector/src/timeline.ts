import { isShow } from '@lumen/shared';
import s from './inspector.module.css';
import type { InspectorStore } from './store';

const MESSAGE = new Set(['toast', 'call', 'strip', 'followup']);
const C = {
  track: '#12171c',
  known: '#171d24',
  gate: 'rgba(233,235,238,0.13)',
  snooze: 'rgba(233,235,238,0.06)',
  show: '#f0b429',
  hold: '#5b6470',
  marker: '#e9ebee',
  axis: '#8e96a1',
  head: '#ffffff',
};

export function clock(t: number): string {
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

export class Timeline {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private dragging = false;
  private lastSeek = 0;
  private wanted: number | null = null;

  constructor(private store: InspectorStore) {
    this.el = document.createElement('div');
    this.el.className = s.timeline!;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'slider');
    this.canvas.setAttribute('aria-label', 'Walk timeline');
    this.canvas.tabIndex = 0;
    const legend = document.createElement('div');
    legend.className = s.legend!;
    legend.innerHTML = `<span><i style="background:${C.show}"></i>Show</span><span><i style="background:${C.hold}"></i>Hold</span><span><i style="background:rgba(233,235,238,.3)"></i>Gate</span><span><i style="background:${C.marker};transform:rotate(45deg) scale(.7)"></i>Message</span>`;
    this.el.append(this.canvas, legend);
    const at = (e: PointerEvent): number => {
      const r = this.canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left - 4) / (r.width - 8))) * this.store.duration;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.store.setPaused(true);
      this.request(at(e), true);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) this.request(at(e), false);
    });
    const end = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.request(at(e), true);
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft') this.request(this.store.now() - step, true);
      else if (e.key === 'ArrowRight') this.request(this.store.now() + step, true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  private request(t: number, now: boolean): void {
    this.wanted = t;
    const wall = performance.now();
    if (now || wall - this.lastSeek > 140) {
      this.lastSeek = wall;
      const target = this.wanted;
      this.wanted = null;
      this.store.seek(target);
      this.draw(target);
    } else this.draw(t);
  }

  draw(head = this.store.now()): void {
    const c = this.canvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const dur = this.store.duration;
    const x = (t: number): number => 4 + (t / dur) * (w - 8);
    const top = 14;
    const bottom = h - 16;
    g.fillStyle = C.track;
    g.fillRect(4, top, w - 8, bottom - top);
    g.fillStyle = C.known;
    g.fillRect(4, top, x(this.store.known()) - 4, bottom - top);
    const frames = this.store.frames();
    let gateFrom: number | null = null;
    let snoozeFrom: number | null = null;
    const span = (a: number, b: number, color: string): void => {
      g.fillStyle = color;
      g.fillRect(x(a), top, Math.max(1, x(b) - x(a)), bottom - top);
    };
    for (const f of frames) {
      if (!f) continue;
      if (f.gate.safety && gateFrom === null) gateFrom = f.t;
      if (!f.gate.safety && gateFrom !== null) {
        span(gateFrom, f.t, C.gate);
        gateFrom = null;
      }
      if (f.gate.snooze && snoozeFrom === null) snoozeFrom = f.t;
      if (!f.gate.snooze && snoozeFrom !== null) {
        span(snoozeFrom, f.t, C.snooze);
        snoozeFrom = null;
      }
    }
    const lastT = frames.at(-1)?.t ?? 0;
    if (gateFrom !== null) span(gateFrom, lastT, C.gate);
    if (snoozeFrom !== null) span(snoozeFrom, lastT, C.snooze);
    for (const f of frames) {
      if (!f) continue;
      for (const d of f.events) {
        const px = Math.round(x(f.t)) + 0.5;
        if (MESSAGE.has(d.component) && (d.action === 'show' || d.action === 'hold')) {
          g.fillStyle = C.marker;
          g.save();
          g.translate(px, top - 6);
          g.rotate(Math.PI / 4);
          g.fillRect(-2.5, -2.5, 5, 5);
          g.restore();
        }
        if (isShow(d) || d.action === 'save' || d.action === 'surface') {
          g.strokeStyle = C.show;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(px, top + 3);
          g.lineTo(px, bottom - 3);
          g.stroke();
        } else if (d.action === 'hold') {
          g.strokeStyle = C.hold;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(px, bottom - 3 - (bottom - top) * 0.38);
          g.lineTo(px, bottom - 3);
          g.stroke();
        }
      }
    }
    g.fillStyle = C.axis;
    g.font = '400 9.5px "Martian Mono", ui-monospace, monospace';
    g.textBaseline = 'top';
    for (let t = 0; t <= dur; t += 15) {
      const px = x(t);
      g.fillRect(Math.round(px), bottom, 1, 3);
      g.textAlign = t === 0 ? 'left' : 'center';
      g.fillText(clock(t).replace(/\.\d$/, ''), px, bottom + 4);
    }
    const hx = Math.round(x(Math.max(0, Math.min(dur, head)))) + 0.5;
    g.strokeStyle = C.head;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(hx, top - 2);
    g.lineTo(hx, bottom + 2);
    g.stroke();
    this.canvas.setAttribute('aria-valuenow', head.toFixed(1));
    this.canvas.setAttribute('aria-valuetext', clock(head));
  }
}
