import { SCENARIO_LABEL } from '@lumen/shared';
import s from './inspector.module.css';
import type { InspectorStore } from './store';
import { clock } from './timeline';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class Exporter {
  readonly el: HTMLElement;
  private summary: HTMLElement;

  constructor(private store: InspectorStore) {
    this.el = el('div', s.panel);
    const b = el('button', `${s.btn} ${s.primary}`, 'Export this run') as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      const run = this.store.exportRun();
      download(`lumen-${run.scenario}-${run.source}-${Math.round(this.store.now())}s.json`, JSON.stringify(run));
    });
    this.summary = el('div', s.note);
    const how = el('p', s.note);
    how.innerHTML = 'The file is the run in the eval format: every snapshot at 10 Hz, every override with its time, and the decision log. Score it with <code>pnpm eval --file &lt;file&gt;</code>; the runner replays the snapshots through the brain and checks that it makes the same decisions, then runs every invariant.';
    this.el.append(b, el('div', s.section, 'Contents'), this.summary, how);
  }

  update(): void {
    const frames = this.store.frames().filter((f) => f && f.t <= this.store.now() + 1e-6);
    const decisions = frames.reduce((n, f) => n + f.events.length, 0);
    this.summary.textContent = `${SCENARIO_LABEL[this.store.scenario]} · ${clock(this.store.now())} · ${frames.length} snapshots · ${decisions} decisions · ${this.store.overrides().length} overrides`;
  }
}
