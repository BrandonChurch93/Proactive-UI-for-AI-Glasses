import { gsap } from 'gsap';
import { EASE, MOVE, T } from './tokens';

export interface LightVals {
  pip: number;
  pipS: number;
  aura: number;
  auraS: number;
  flare: number;
  flareSX: number;
  head: number;
  lead: number;
  leadO: number;
  mix: number;
}

export function lightVals(): LightVals {
  return { pip: 0, pipS: 0.2, aura: 0, auraS: 0.5, flare: 0, flareSX: 1.2, head: 0, lead: 0, leadO: 0, mix: 1 };
}

export interface PaneEls {
  pane: HTMLElement;
  seed: HTMLElement;
  kids: HTMLElement[];
  why: HTMLElement | null;
  width: number;
}

type TL = gsap.core.Timeline;

export function mark(tl: TL, L: LightVals, at: number): number {
  tl.fromTo(L, { pip: 0, pipS: 0.2 }, { pip: 1, pipS: 1, duration: MOVE.markPip, ease: EASE.out }, at);
  tl.fromTo(L, { aura: 0.8, auraS: 0.5 }, { aura: 0, auraS: 2.6, duration: MOVE.markAura, ease: 'power2.out' }, at + MOVE.markAuraDelay);
  return at + MOVE.markPip;
}

export function gaze(tl: TL, L: LightVals, at: number, reduced: boolean): void {
  tl.to(L, { aura: 1, auraS: 1.6, pipS: 1.6, duration: MOVE.gaze, ease: 'sine.inOut' }, at);
  if (reduced) return;
  tl.fromTo(L, { flare: 0, flareSX: 1.2 }, { flare: 1, flareSX: 5.5, duration: MOVE.flareIn, ease: EASE.out }, at + MOVE.flareInAt);
  tl.to(L, { flare: 0, duration: MOVE.flareOut, ease: EASE.in }, at + MOVE.flareOutAt);
}

export function ungaze(tl: TL, L: LightVals, at: number): void {
  tl.to(L, { aura: 0, auraS: 0.5, pipS: 1, flare: 0, duration: T.base, ease: EASE.out }, at);
}

export function travel(tl: TL, L: LightVals, at: number, dur: number, fromPane: boolean, reduced: boolean): number {
  if (reduced) {
    tl.set(L, { lead: 1, leadO: 1, mix: 1, head: 0 }, at);
    return at;
  }
  if (fromPane) {
    tl.set(L, { lead: 1, leadO: 1, head: 1, mix: 0 }, at);
    tl.to(L, { mix: 1, duration: dur, ease: EASE.travel }, at);
  } else {
    tl.set(L, { lead: 0, leadO: 1, head: 1, mix: 1 }, at);
    tl.to(L, { lead: 1, duration: dur, ease: EASE.travel }, at);
  }
  tl.to(L, { head: 0, duration: MOVE.headFade, ease: EASE.in }, at + dur);
  return at + dur;
}

export function retract(tl: TL, L: LightVals, at: number, reduced: boolean): number {
  if (reduced) {
    tl.set(L, { lead: 0, leadO: 0, head: 0 }, at);
    return at;
  }
  tl.set(L, { head: 1 }, at);
  tl.to(L, { lead: 0, duration: MOVE.retract, ease: EASE.in }, at);
  tl.set(L, { head: 0, leadO: 0 }, at + MOVE.retract);
  return at + MOVE.retract;
}

export function hidePane(p: PaneEls): void {
  gsap.set(p.pane, { clipPath: 'inset(0 0 100% 0)', '--ca': 0 });
  gsap.set(p.kids, { opacity: 0 });
  if (p.why) gsap.set(p.why, { opacity: 0 });
  gsap.set(p.seed, { width: 0, opacity: 0 });
}

export function condense(
  tl: TL,
  p: PaneEls,
  at: number,
  opts: { card: boolean; reduced: boolean; open?: boolean; whyAt?: number; fade: { v: number } },
): number {
  const reveal = opts.open ? T.open : opts.card ? T.baseCard : T.base;
  const kids = opts.whyAt !== undefined && p.why ? p.kids.filter((k) => k !== p.why) : p.kids;
  if (opts.reduced) {
    tl.set(p.pane, { clipPath: 'inset(0 0 0% 0)', '--ca': 0 }, at);
    tl.set(p.kids, { opacity: 1, y: 0, filter: 'none' }, at);
    tl.fromTo(opts.fade, { v: 0 }, { v: 1, duration: 0.2, ease: 'none' }, at);
    return at + 0.2;
  }
  tl.set(opts.fade, { v: 1 }, at);
  tl.fromTo(p.seed, { width: 0, opacity: 1 }, { width: p.width, duration: MOVE.seedGrow, ease: EASE.out }, at);
  tl.fromTo(p.pane, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: reveal, ease: EASE.out }, at + MOVE.revealAt);
  tl.fromTo(p.pane, { '--ca': MOVE.caFrom }, { '--ca': 0, duration: MOVE.caDur, ease: 'power2.out' }, at + MOVE.caAt);
  tl.fromTo(
    kids,
    { opacity: 0, y: -3, filter: 'blur(5px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: T.base, ease: EASE.out, stagger: MOVE.stagger, clearProps: 'filter' },
    at + MOVE.kidsAt,
  );
  tl.to(p.seed, { opacity: 0, duration: MOVE.seedFade, ease: EASE.in }, at + MOVE.seedFadeAt);
  let end = at + MOVE.kidsAt + T.base + MOVE.stagger * Math.max(0, kids.length - 1);
  if (opts.whyAt !== undefined && p.why) {
    const w = Math.max(end, opts.whyAt);
    tl.fromTo(p.why, { opacity: 0, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0px)', duration: T.base, ease: EASE.out, clearProps: 'filter' }, w);
    end = w + T.base;
  }
  return Math.max(end, at + MOVE.seedFadeAt + MOVE.seedFade);
}

export function dissolve(tl: TL, p: PaneEls, at: number, reduced: boolean, fade: { v: number }): number {
  if (reduced) {
    tl.to(fade, { v: 0, duration: 0.2, ease: 'none' }, at);
    return at + 0.2;
  }
  const kids = [...p.kids].reverse();
  tl.to(kids, { opacity: 0, filter: 'blur(4px)', duration: MOVE.dissolveKids, ease: EASE.in, stagger: MOVE.dissolveStagger }, at);
  tl.set(p.seed, { width: p.width, opacity: 1 }, at);
  tl.to(p.pane, { clipPath: 'inset(0 0 100% 0)', '--ca': MOVE.dissolveCa, duration: T.quick, ease: EASE.in }, at + MOVE.dissolveClipAt);
  tl.to(p.seed, { width: 0, duration: T.quick, ease: EASE.in }, at + MOVE.dissolveSeedAt);
  tl.set(p.seed, { opacity: 0 }, at + MOVE.dissolveSeedAt + T.quick);
  return at + MOVE.dissolveSeedAt + T.quick;
}

export function recede(tl: TL, hud: HTMLElement, gateK: { v: number }): TL {
  tl.to(hud, { filter: 'blur(3px) brightness(0.55)', y: 14, scale: 0.985, opacity: 0.38, duration: MOVE.recede, ease: EASE.gate }, 0);
  tl.to(gateK, { v: 0.2, duration: MOVE.recede, ease: EASE.gate }, 0);
  return tl;
}

export function unrecede(tl: TL, hud: HTMLElement, gateK: { v: number }): TL {
  tl.to(hud, { filter: 'blur(0px) brightness(1)', y: 0, scale: 1, opacity: 1, duration: MOVE.returnS, ease: EASE.out, clearProps: 'filter' }, 0);
  tl.to(gateK, { v: 1, duration: MOVE.returnS, ease: EASE.out }, 0);
  return tl;
}
