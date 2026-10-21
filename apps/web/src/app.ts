import { isShow, type ScenarioId } from '@lumen/shared';
import { mount, type EvalReport, type Inspector, type InspectorStore } from '@lumen/inspector';
import { Ambient } from './audio/ambient';
import { Chrome } from './chrome/chrome';
import { EndCard, TOUCH, TitleScreen, type EndStats } from './title/title';

const LONG_PRESS_MS = 550;
import { Walk } from './walk';
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
  private upright = false;
  private pausedForRotate = false;
  private lastDismiss = -Infinity;
  private press: ReturnType<typeof setTimeout> | null = null;
  private drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean; pressed: boolean } | null = null;

  constructor(
    private world: World,
    private canvas: HTMLCanvasElement,
    private layer: HTMLElement,
    private ui: HTMLElement,
    private opts: AppOptions & { pace?: boolean },
    start: ScenarioId | null,
  ) {
    this.title = new TitleScreen(ui, (id) => this.choose(id));
    this.end = new EndCard(
      ui,
      () => this.again(),
      (id) => this.choose(id, true),
    );
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
    );
    if (start) {
      this.mode = 'walk';
      this.walk = this.makeWalk(start, Boolean(opts.scripted));
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

  private makeWalk(id: ScenarioId, scripted: boolean): Walk {
    const w = new Walk(this.world, id, this.layer, {
      scripted,
      ...(this.opts.exact ? { exact: true } : {}),
      ...(this.opts.reducedMotion !== undefined ? { reducedMotion: this.opts.reducedMotion } : {}),
      ...(this.opts.focusOutline ? { focusOutline: true } : {}),
    });
    this.syncSound(w);
    return w;
  }

  private store(w: Walk): InspectorStore {
    let outline = Boolean(this.opts.focusOutline);
    return {
      scenario: w.scenario,
      duration: w.duration,
      report: REPORT,
      now: () => w.t,
      known: () => w.known,
      frames: () => w.frames,
      snapshots: () => w.snapshots,
      overrides: () => w.overrides(),
      panes: () => w.overlay?.report().panes ?? [],
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

  private updatePace(): void {
    const f = this.walk.last()?.frame;
    this.chrome.setPace(this.pace && this.mode === 'walk' && f ? `PACE · ${f.band.toUpperCase()} · ${f.speed.toFixed(1)} M/S` : null);
  }

  setPaused(p: boolean): void {
    this.walk.paused = p;
    this.chrome.setPaused(p && this.mode === 'walk' && !this.inspector?.isOpen);
  }

  private choose(id: ScenarioId, fromEnd = false): void {
    const go = (): void => {
      this.walk.dispose();
      this.hideEnd();
      this.mode = 'walk';
      this.walk = this.makeWalk(id, false);
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
    this.title.show(true);
  }

  private stats(): EndStats {
    const held = new Set<string>();
    let showed = 0;
    for (const f of this.walk.frames) {
      if (!f) continue;
      for (const d of f.events) {
        if (d.action === 'hold' && d.placement.zone !== 'ground') held.add(d.id);
        if (isShow(d)) showed++;
      }
    }
    return { scenario: this.walk.scenario, held: held.size, showed };
  }

  private showEnd(): void {
    this.endShown = true;
    this.setPaused(true);
    this.chrome.setPaused(false);
    this.end.show(this.stats());
  }

  private hideEnd(): void {
    this.end.hide();
    this.endShown = false;
  }

  private toggleSound(): boolean {
    this.soundOn = !this.soundOn;
    this.syncSound(this.walk);
    return this.soundOn;
  }

  private syncSound(w: Walk): void {
    const live = this.soundOn && this.mode === 'walk';
    if (live !== this.ambient.on) this.ambient.toggle();
    w.setSound(this.ambient.context, live);
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
      this.drag = { x: e.clientX, y: e.clientY, yaw: this.walk.head.yaw, pitch: this.walk.head.pitch, moved: false, pressed: false };
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
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= (e.pointerType === 'touch' ? 8 : 4)) d.moved = true;
      if (!d.moved) return;
      const yaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d.yaw + (e.clientX - d.x) * 0.0032));
      const pitch = Math.max(-0.6, Math.min(0.75, d.pitch + (e.clientY - d.y) * 0.0028));
      this.walk.look(yaw, pitch);
    });
    canvas.addEventListener('pointerup', () => {
      if (this.press) clearTimeout(this.press);
      if (this.drag && !this.drag.moved && !this.drag.pressed) this.walk.pinch();
      this.drag = null;
    });
    canvas.addEventListener('pointercancel', () => {
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
        if (this.inspector?.isOpen && this.end.visible) this.end.hide();
      } else if (e.key === 'Escape') {
        if (this.inspector?.isOpen) this.inspector.close();
        else this.dismiss();
      } else if (e.key === 'Enter') {
        if ((e.target as HTMLElement).closest('button')) return;
        this.walk.pinch();
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
    if (!w.paused && !(this.mode === 'walk' && w.ended)) {
      w.step();
      if (this.mode === 'attract' && w.ended) {
        w.dispose();
        this.walk = this.makeWalk('walking', true);
      }
    }
    if (this.mode === 'walk' && w.ended && !this.endShown && !this.inspector?.isOpen) this.showEnd();
    this.updatePace();
    this.ambient.update(w.t, w.sim.wearer.speed);
    void dt;
  }
}
