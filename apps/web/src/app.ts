import { LEVEL_RANK, PLACE_BY_ID, angleWrap, isShow, reasonIsClean, uiScale, yawToward, type Band, type ComponentKind, type ScenarioId, type WorldSnapshot } from '@lumen/shared';
import { mount, type EvalReport, type Inspector, type InspectorStore } from '@lumen/inspector';
import { Ambient, type StreetFrame } from './audio/ambient';
import { Chrome } from './chrome/chrome';
import { EndCard, TOUCH, TitleScreen, type EndStats } from './title/title';

const LONG_PRESS_MS = 550;
import { TURN_PER_VIEW, Walk } from './walk';
import type { World } from './world/world';

const reports = import.meta.glob<EvalReport>('../../../packages/evals/report/latest.json', { eager: true, import: 'default' });
const REPORT: EvalReport | null = Object.values(reports)[0] ?? null;

export interface AppOptions {
  reducedMotion?: boolean;
  focusOutline?: boolean;
  exact?: boolean;
  scripted?: boolean;
}

type Mode = 'attract' | 'walk';

const NOT_DECIDED = new Set<ComponentKind>(['intent', 'picker', 'thread', 'toast', 'strip']);

// What the street sounds need from the walk: the band for the cadence, the crossing and its signal, and which side the road is on.
function streetFrame(w: Walk, band: Band, snap: WorldSnapshot): StreetFrame {
  const sim = w.sim;
  const eye = sim.wearer.pos;
  const cw = snap.env.crosswalk;
  const crossing = sim.wearer.state === 'crossing';
  const waiting = Boolean(cw && cw.signal !== 'walk' && cw.distance < 1.5 && sim.wearer.speed < 0.2);
  const post = cw ? sim.anchorOf(`signal:${cw.id}`) : undefined;
  const head = sim.head.yaw;
  const signalPan = post ? -Math.sin(angleWrap(yawToward(eye, post) - head)) : 0;
  const roadPan = -Math.sin(angleWrap(yawToward(eye, { x: 0, y: eye.y, z: eye.z }) - sim.wearer.bodyYaw));
  return { t: w.t, band, crossing, walkSignal: Boolean(cw && cw.signal === 'walk'), beeping: crossing || waiting, roadPan, signalPan, paint: crossing };
}

export class App {
  walk: Walk;
  mode: Mode;
  readonly title: TitleScreen;
  readonly end: EndCard;
  readonly chrome: Chrome;
  private inspector: Inspector | null = null;
  private ambient = new Ambient();
  private soundOn = false;
  private endShown = false;
  private pace = false;
  private gazeMark = true;
  private snapTarget: string | null = null;
  private upright = false;
  private pausedForRotate = false;
  private lastDismiss = -Infinity;
  private press: ReturnType<typeof setTimeout> | null = null;
  private drag: { x: number; y: number; moved: boolean; pressed: boolean } | null = null;

  constructor(
    private world: World,
    private canvas: HTMLCanvasElement,
    private layer: HTMLElement,
    private ui: HTMLElement,
    private opts: AppOptions & { pace?: boolean },
    start: ScenarioId | null,
  ) {
    this.title = new TitleScreen(ui, () => this.choose('walking', false, null));
    this.end = new EndCard(ui, {
      again: () => this.again(),
      keepWalking: () => this.choose('walking', true, null),
      inspect: (t, id) => this.inspect(t, id),
    });
    this.chrome = new Chrome(
      ui,
      {
        sound: () => this.toggleSound(),
        inspector: () => this.inspector?.toggle(),
        pause: () => {
          this.setPaused(!this.walk.paused);
          return this.walk.paused;
        },
      },
      TOUCH,
      layer,
    );
    if (start) {
      this.mode = 'walk';
      this.walk = this.makeWalk(start, Boolean(opts.scripted), start);
      this.mountInspector();
    } else {
      this.mode = 'attract';
      this.walk = this.makeWalk('walking', true);
      this.title.show();
    }
    this.chrome.setInspectorHint(this.mode === 'walk');
    this.pace = Boolean(opts.pace);
    this.bindInput();
    this.resize();
    document.addEventListener('visibilitychange', () => this.ambient.pause(document.hidden));
  }

  resize(): void {
    this.walk.sim.viewport = { w: innerWidth, h: innerHeight };
    document.documentElement.style.setProperty('--ui', uiScale({ w: innerWidth, h: innerHeight }).toFixed(3));
    const upright = innerWidth < innerHeight && innerWidth < 700;
    if (upright === this.upright) return;
    this.upright = upright;
    this.chrome.setRotate(upright);
    if (upright) {
      this.pausedForRotate = !this.walk.paused;
      this.walk.paused = true;
    } else if (this.pausedForRotate) {
      this.pausedForRotate = false;
      this.walk.paused = false;
    }
  }

  private makeWalk(id: ScenarioId, scripted: boolean, suggest?: ScenarioId | null): Walk {
    const w = new Walk(this.world, id, this.layer, {
      scripted,
      attract: this.mode === 'attract',
      ...(suggest !== undefined ? { suggest } : {}),
      ...(this.opts.exact ? { exact: true } : {}),
      ...(this.opts.reducedMotion !== undefined ? { reducedMotion: this.opts.reducedMotion } : {}),
      ...(this.opts.focusOutline ? { focusOutline: true } : {}),
      chrome: () => this.chrome.rects(),
    });
    this.syncSound(w);
    return w;
  }

  private store(w: Walk): InspectorStore {
    let outline = Boolean(this.opts.focusOutline);
    return {
      scenario: w.scenario,
      get duration() {
        return w.duration;
      },
      endWalk: () => {
        w.end();
        this.inspector?.close();
      },
      report: REPORT,
      now: () => w.t,
      known: () => w.known,
      frames: () => w.frames,
      snapshots: () => w.snapshots,
      overrides: () => w.overrides(),
      panes: () => w.overlay?.report().panes ?? [],
      overlayLog: () => w.overlayLog,
      paused: () => w.paused,
      setPaused: (p) => this.setPaused(p),
      seek: (t) => {
        w.seek(t);
        if (w.t < w.duration - 0.05 && this.end.visible) this.hideEnd();
        this.world.render();
      },
      override: (o) => w.override(o),
      focusOutline: () => outline,
      setFocusOutline: (on) => {
        outline = on;
        w.setFocusOutline(on);
      },
      gazeMark: () => this.gazeMark,
      setGazeMark: (on) => {
        this.gazeMark = on;
      },
      paceReadout: () => this.pace,
      setPaceReadout: (on) => {
        this.pace = on;
        this.updatePace();
      },
      exportRun: () => w.exportRun(),
      subscribe: (fn) => w.subscribe(fn),
    };
  }

  private mountInspector(): void {
    this.inspector?.dispose();
    this.inspector = mount(this.ui, this.store(this.walk), () => {
      if (this.walk.ended) {
        if (!this.end.visible) this.showEnd();
      } else if (this.endShown) {
        this.endShown = false;
        this.setPaused(false);
      } else this.setPaused(this.walk.paused);
    });
  }

  private pinch(): void {
    this.snapTarget = this.walk.sim.gaze.target ?? null;
    this.walk.pinch();
  }

  private updateMark(): void {
    const w = this.walk;
    const f = w.last()?.frame;
    const show = this.gazeMark && this.mode === 'walk' && !this.title.visible && !this.end.visible && !w.hoverId && !f?.gate.safety;
    if (!show) {
      this.chrome.setMark(null);
      return;
    }
    const target = f?.dwell.target;
    const mark = target ? f?.dwell.mark : undefined;
    if (this.snapTarget && this.snapTarget !== w.sim.gaze.target) this.snapTarget = null;
    const reduced = this.opts.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    const p = mark ? (this.snapTarget === target ? 1 : Math.min(1, mark.p + mark.rate * Math.max(0, w.t - f!.t))) : null;
    this.chrome.setMark({ lit: Boolean(mark), p: reduced ? null : p });
  }

  syncChrome(): void {
    this.updatePace();
    this.updateMark();
  }

  private updatePace(): void {
    const f = this.walk.last()?.frame;
    this.chrome.setPace(this.pace && this.mode === 'walk' && f ? `PACE · ${f.band.toUpperCase()} · ${f.speed.toFixed(1)} M/S` : null);
  }

  setPaused(p: boolean): void {
    this.walk.paused = p;
    this.chrome.setPaused(p && this.mode === 'walk' && !this.inspector?.isOpen);
  }

  private choose(id: ScenarioId, fromEnd = false, suggest: ScenarioId | null = id): void {
    const go = (): void => {
      this.walk.dispose();
      this.hideEnd();
      this.mode = 'walk';
      this.walk = this.makeWalk(id, false, suggest);
      this.mountInspector();
      this.chrome.setInspectorHint(true);
      this.title.reveal();
      this.syncSound(this.walk);
    };
    if (fromEnd) {
      this.title.show(true);
      this.title.el.style.opacity = '0';
      go();
      this.title.el.style.opacity = '';
    } else go();
  }

  private again(): void {
    this.hideEnd();
    this.walk.dispose();
    this.inspector?.dispose();
    this.inspector = null;
    this.mode = 'attract';
    this.walk = this.makeWalk('walking', true);
    this.chrome.setInspectorHint(false);
    this.syncSound(this.walk);
    this.title.show(true);
  }

  private stats(): EndStats {
    const w = this.walk;
    const places = new Set<string>();
    for (const snap of w.snapshots) for (const e of snap?.entities ?? []) if (e.distance <= 70) places.add(e.id);
    const level = new Map<string, number>();
    const held = new Set<string>();
    const ticks: EndStats['ticks'] = [];
    const gates: [number, number][] = [];
    const bands: { t: number; band: Band }[] = [];
    const shows: { t: number; id: string; name: string; reason: string; score: number }[] = [];
    const prefer: { t: number; name: string; reason: string; rank: number }[] = [];
    const noted = new Set<string>();
    let lastPick: (typeof prefer)[number] | null = null;
    let cards = 0;
    let saved = 0;
    let replies = 0;
    const reached: string[] = [];
    let at: string | null = null;
    for (const snap of w.snapshots) {
      if (!snap) continue;
      const door = snap.goal.arrived ? (snap.goal.destination ?? null) : null;
      if (door && door !== at) reached.push(PLACE_BY_ID.get(door)?.name ?? door);
      at = door;
      const c = snap.wearer.choice;
      if (c && snap.inbox.some((n) => n.id === c.id && n.replies?.some((r) => r.id === c.action))) replies++;
    }
    let gateFrom: number | null = null;
    let first: EndStats['first'] = null;
    for (const f of w.frames) {
      if (!f) continue;
      if (bands[bands.length - 1]?.band !== f.band) bands.push({ t: f.t, band: f.band });
      if (f.gate.safety && gateFrom === null) gateFrom = f.t;
      if (!f.gate.safety && gateFrom !== null) {
        gates.push([gateFrom, f.t]);
        gateFrom = null;
      }
      for (const d of f.events) {
        if (d.component === 'route' && d.action === 'show' && reasonIsClean(d.reason.text)) {
          if (d.cause === 'reply') prefer.push({ t: f.t, name: d.content.name, reason: d.reason.text, rank: 0 });
          if (d.cause === 'choice') lastPick = { t: f.t, name: d.content.name, reason: d.reason.text, rank: 1 };
        }
        if (d.component === 'thread' && d.content.note && !noted.has(d.id)) {
          noted.add(d.id);
          prefer.push({ t: f.t, name: d.content.name, reason: d.content.note, rank: 0 });
        }
        if (d.cause === 'arrival' && (isShow(d) || d.action === 'promote')) prefer.push({ t: f.t, name: d.content.name, reason: d.reason.text, rank: 2 });
        if (d.placement.zone === 'ground') continue;
        const was = level.get(d.id) ?? 0;
        const now = LEVEL_RANK[d.level];
        if ((d.action === 'show' || d.action === 'promote') && now >= LEVEL_RANK.card && was < LEVEL_RANK.card) {
          cards++;
          ticks.push({ t: f.t, kind: 'card' });
        }
        if (d.action !== 'hold') level.set(d.id, d.action === 'dismiss' ? 0 : now);
        if (d.action === 'hold') {
          ticks.push({ t: f.t, kind: 'hold' });
          if (f.gate.safety) held.add(d.id);
        }
        if (d.action === 'save') saved++;
        if (isShow(d)) first ??= { t: f.t, id: d.id };
        if ((isShow(d) || (d.action === 'promote' && now >= LEVEL_RANK.card)) && !NOT_DECIDED.has(d.component)) {
          if (d.reason.text && d.reason.text !== d.content.name && d.reason.kind !== 'gate' && reasonIsClean(d.reason.text)) shows.push({ t: f.t, id: d.id, name: d.content.name, reason: d.reason.text, score: d.score });
        }
      }
    }
    if (gateFrom !== null) gates.push([gateFrom, w.duration]);
    if (lastPick) prefer.push(lastPick);
    const picked = new Map<string, { t: number; name: string; reason: string }>();
    for (const x of prefer.sort((a, b) => a.rank - b.rank || a.t - b.t)) if (picked.size < 3 && !picked.has(x.name)) picked.set(x.name, x);
    const best = new Map<string, (typeof shows)[number]>();
    for (const x of shows) if (!picked.has(x.name) && (!best.has(x.name) || best.get(x.name)!.score < x.score)) best.set(x.name, x);
    for (const x of [...best.values()].sort((a, b) => b.score - a.score)) if (picked.size < 3) picked.set(x.name, x);
    const decided = [...picked.values()].sort((a, b) => a.t - b.t).map(({ t, name, reason }) => ({ t, name, reason }));
    return { duration: w.duration, places: places.size, cards, held: held.size, saved, reached, replies, ticks, gates, bands, decided, first };
  }

  private inspect(t: number, id: string): void {
    this.hideEnd();
    if (!this.inspector) this.mountInspector();
    this.inspector?.openAt(t, id);
  }

  private showEnd(): void {
    this.endShown = true;
    this.setPaused(true);
    this.chrome.setPaused(false);
    this.walk.setGlassesVisible(false);
    this.end.show(this.stats());
  }

  private hideEnd(): void {
    this.end.hide();
    this.walk.setGlassesVisible(true);
    this.endShown = false;
  }

  private toggleSound(): boolean {
    this.soundOn = !this.soundOn;
    this.syncSound(this.walk);
    return this.soundOn;
  }

  private syncSound(w: Walk): void {
    const live = this.soundOn && this.mode !== 'attract';
    if (live !== this.ambient.on) this.ambient.toggle();
    w.setSound(this.ambient.context, live, this.ambient.ui);
  }

  private dismiss(): void {
    if (this.mode !== 'walk' || performance.now() - this.lastDismiss < 400) return;
    this.lastDismiss = performance.now();
    this.walk.dismiss();
  }

  private bindInput(): void {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.mode !== 'walk') return;
      this.drag = { x: e.clientX, y: e.clientY, moved: false, pressed: false };
      this.walk.holding = true;
      canvas.setPointerCapture(e.pointerId);
      if (this.press) clearTimeout(this.press);
      this.press = setTimeout(() => {
        const d = this.drag;
        if (!d || d.moved) return;
        d.pressed = true;
        this.dismiss();
      }, LONG_PRESS_MS);
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < (e.pointerType === 'touch' ? 8 : 4)) return;
      const k = TURN_PER_VIEW / innerWidth;
      this.walk.turn((e.clientX - d.x) * k, (e.clientY - d.y) * k);
      d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
    });
    canvas.addEventListener('pointerup', () => {
      this.walk.holding = false;
      if (this.press) clearTimeout(this.press);
      if (this.drag && !this.drag.moved && !this.drag.pressed) this.pinch();
      this.drag = null;
    });
    canvas.addEventListener('pointercancel', () => {
      this.walk.holding = false;
      if (this.press) clearTimeout(this.press);
      this.drag = null;
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.dismiss();
    });
    this.layer.addEventListener('pointerover', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('[data-gaze]');
      const pane = t.closest<HTMLElement>('[data-pane]');
      this.walk.hoverId = row?.dataset.gaze ?? (pane && pane.dataset.zone === 'view' ? pane.dataset.pane! : null);
    });
    this.layer.addEventListener('pointerout', () => (this.walk.hoverId = null));
    addEventListener('keydown', (e) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]');
      if (typing) return;
      if (this.title.visible && (e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).closest('button')) {
        this.title.skipToChoice();
        e.preventDefault();
        return;
      }
      if (this.mode !== 'walk') return;
      if (e.key === 'i' || e.key === 'I') {
        this.inspector?.toggle();
        if (this.inspector?.isOpen && this.end.visible) this.hideEnd();
      } else if (e.key === 'Escape') {
        if (this.inspector?.isOpen) this.inspector.close();
        else this.dismiss();
      } else if (e.key === 'Enter') {
        if ((e.target as HTMLElement).closest('button')) return;
        this.pinch();
      } else if (e.key === ' ') {
        if ((e.target as HTMLElement).closest('button')) return;
        if (this.end.visible) return;
        this.setPaused(!this.walk.paused);
        e.preventDefault();
      }
    });
  }

  frame(dt: number): void {
    const w = this.walk;
    if (!w.paused && !(this.mode !== 'attract' && w.ended)) {
      w.step();
      if (this.mode === 'attract' && w.ended) {
        w.dispose();
        this.walk = this.makeWalk('walking', true);
      }
    }
    if (this.mode !== 'attract' && w.ended && !this.endShown && !this.inspector?.isOpen) this.showEnd();
    this.updatePace();
    this.updateMark();
    const last = w.last();
    if (last) this.ambient.update(streetFrame(w, last.frame.band, last.snap));
    void dt;
  }
}
