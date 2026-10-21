import type { BrainFrame, WorldSnapshot } from '@lumen/shared';
import s from './inspector.module.css';
import type { InspectorStore } from './store';

const BUDGET = 7;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function current(store: InspectorStore): { frame: BrainFrame; snap: WorldSnapshot } | null {
  const frames = store.frames();
  const snaps = store.snapshots();
  const now = store.now();
  for (let k = frames.length - 1; k >= 0; k--) {
    const f = frames[k];
    const sn = snaps[k];
    if (f && sn && f.t <= now + 1e-6) return { frame: f, snap: sn };
  }
  return null;
}

export class Signals {
  readonly el: HTMLElement;

  constructor(private store: InspectorStore) {
    this.el = el('div', s.panel);
  }

  update(): void {
    const cur = current(this.store);
    const out: HTMLElement[] = [];
    if (!cur) {
      this.el.replaceChildren(el('div', s.empty, 'The walk has not started.'));
      return;
    }
    const { frame: f, snap } = cur;
    const section = (name: string): void => {
      out.push(el('div', s.section, name));
    };
    const kv = (k: string, v: string | HTMLElement): void => {
      const r = el('div', s.kv);
      r.append(el('span', undefined, k), typeof v === 'string' ? el('span', undefined, v) : v);
      out.push(r);
    };
    section('Pace');
    kv('Band', `${f.band.toUpperCase()} · ${snap.wearer.speed.toFixed(2)} m/s`);
    kv('Focus zone', `${Math.round(f.focus.w * 100)} × ${Math.round(f.focus.h * 100)} % of the view`);
    kv('State', `${snap.wearer.state}${f.stoppedFor > 0 ? ` · stopped ${f.stoppedFor.toFixed(1)} s` : ''}`);
    section('Gates');
    const gates = Object.entries(f.gate)
      .filter(([k, v]) => v === true && k !== 'safetyCause')
      .map(([k]) => (k === 'safety' && f.gate.safetyCause ? `safety (${f.gate.safetyCause})` : k));
    kv('Active', gates.length ? gates.join(', ') : 'none');
    const cw = snap.env.crosswalk;
    kv('Crosswalk', cw ? `${cw.id} · ${cw.signal.toUpperCase()} ${cw.secondsLeft.toFixed(0)} s · ${cw.distance.toFixed(1)} m${cw.inRoadway ? ' · in the roadway' : ''}` : 'none ahead');
    const vehicles = snap.env.vehicles;
    const threat = vehicles.filter((v) => v.timeToPath !== undefined).sort((a, b) => a.timeToPath! - b.timeToPath!)[0];
    kv('Vehicles', `${vehicles.length} within 60 m${threat ? ` · ${threat.id} reaches the path in ${threat.timeToPath!.toFixed(1)} s` : ''}`);
    const people = snap.env.people;
    kv('People', `${people.length} within 30 m · ${people.filter((p) => p.onPath).length} on the path`);
    section('Attention');
    kv('Looking at', f.dwell.target ?? 'nothing');
    kv('Dwell', `${(f.dwell.dwellMs / 1000).toFixed(1)} s · earned ${f.dwell.earned}`);
    const meter = el('span', s.meter);
    for (let i = 0; i < BUDGET; i++) meter.appendChild(el('b', i < f.model.budget ? undefined : s.empty));
    meter.appendChild(el('em', undefined, `${f.model.budget} left · ${f.model.budgetUsed} shown`));
    kv('Budget', meter);
    kv('Standing', f.items.filter((d) => d.level !== 'pip' && d.placement.zone !== 'ground').map((d) => `${d.id} (${d.level})`).join(', ') || 'nothing on the glass');
    kv('Held glyph', f.glyph ? f.glyph.label : 'hidden');
    kv('Pocket', f.model.pocket.length ? f.model.pocket.join(', ') : 'empty');
    kv('Snooze', f.model.snoozeUntil !== undefined && f.model.snoozeUntil > f.t ? `${Math.ceil(f.model.snoozeUntil - f.t)} s left` : 'off');
    section('Social and goal');
    kv('Social', `${snap.social.inConversation ? 'in conversation' : 'alone'}${f.gate.social ? ' · holding' : ''}`);
    kv('Goal', `${f.goal.scenario}${f.goal.destination ? ` · to ${f.goal.destination}` : ''}`);
    if (f.goal.stops.length) kv('Stops', f.goal.stops.join(' > '));
    section('Backdrop behind each pane');
    const lum = Object.entries(snap.env.backdrop);
    if (lum.length === 0) kv('Panes', 'none visible');
    for (const [id, l] of lum) kv(id, `${l.toFixed(2)} · ${l > 0.6 ? 'bright · fill .78, weight 500' : l < 0.4 ? 'dark · fill .52' : 'mid · fill .66'}`);
    this.el.replaceChildren(...out);
  }
}
