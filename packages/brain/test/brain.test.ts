import { describe, expect, it } from 'vitest';
import { FOCUS_ZONE, WALK, synthesize, type CaseSpec, type WorldSnapshot } from '@lumen/shared';
import { Brain, DEFAULT_CONFIG, Pace, countCopy, trimForPace } from '../src';
import { computeGates } from '../src/gates';
import { newLadderItem, step } from '../src/ladder';
import { Pocket } from '../src/pocket';

const cfg = DEFAULT_CONFIG;

function runSpec(spec: CaseSpec): { t: number; line: string }[] {
  const brain = new Brain({ scenario: spec.scenario });
  const out: { t: number; line: string }[] = [];
  for (const s of synthesize(spec)) {
    for (const d of brain.tick(s).events) out.push({ t: s.t, line: `${d.action} ${d.id} ${d.level}` });
  }
  return out;
}

describe('the first 30 seconds of Hungry, hand-written', () => {
  const spec: CaseSpec = {
    id: 'hungry-30',
    scenario: 'hungry',
    duration: 34,
    pace: [[0, 1.38]],
    gaze: [
      [14, 'mega-burger'],
      [30, null],
    ],
    pinch: [[22, 'mega-burger']],
  };

  it('labels the best fit, gives a far place a compact card on a look, saves on pinch and walks back down', () => {
    const lines = runSpec(spec).filter((e) => e.line.includes('goldies') || e.line.includes('mega-burger'));
    const at = (line: string): number | undefined => lines.find((e) => e.line === line)?.t;
    expect(at('show goldies-counter label')).toBeCloseTo(2.0, 5);
    expect(at('demote goldies-counter pip')).toBeCloseTo(4.5, 5);
    expect(at('show mega-burger label')).toBeCloseTo(14.3, 5);
    expect(at('promote mega-burger card')).toBeCloseTo(15.3, 5);
    expect(at('save mega-burger card')).toBeCloseTo(22.0, 5);
    expect(at('demote mega-burger label')).toBeCloseTo(31.1, 5);
    expect(at('demote mega-burger pip')).toBeCloseTo(33.9, 5);
    expect(lines.filter((e) => e.line === 'show mega-burger label')).toHaveLength(1);
  });

  it('is deterministic: two runs give identical logs', () => {
    const a = new Brain({ scenario: 'hungry' });
    const b = new Brain({ scenario: 'hungry' });
    for (const s of synthesize(spec)) a.tick(s);
    for (const s of synthesize(spec)) b.tick(s);
    expect(JSON.stringify(a.log.entries)).toBe(JSON.stringify(b.log.entries));
  });
});

describe('pace bands', () => {
  it('change only after 600 ms in the new range', () => {
    const p = new Pace(cfg);
    expect(p.update(1.38, 0)).toBe('walk');
    expect(p.update(1.9, 1.0)).toBe('walk');
    expect(p.update(1.9, 1.5)).toBe('walk');
    expect(p.update(1.9, 1.6)).toBe('brisk');
    expect(p.update(1.38, 1.7)).toBe('brisk');
    expect(p.update(1.9, 1.8)).toBe('brisk');
  });
});

describe('gates', () => {
  const base = synthesize({ id: 'g', scenario: 'walking', duration: 0, pace: [[0, 1.38]] })[0]!;
  const gate = (mut: (s: WorldSnapshot) => void, inp = { snoozed: false, budget: 7, forceSafety: false }) => {
    const s = structuredClone(base);
    mut(s);
    return computeGates(s, inp, cfg);
  };
  it('crossing is a safety gate', () => expect(gate((s) => (s.wearer.state = 'crossing')).safetyCause).toBe('crossing'));
  it('a vehicle under 3 s from the path is a safety gate', () => {
    const g = gate((s) => s.env.vehicles.push({ id: 'v', kind: 'car', pos: s.wearer.pos, vel: s.wearer.pos, bounds: { min: s.wearer.pos, max: s.wearer.pos }, timeToPath: 2.5 }));
    expect(g.safety).toBe(true);
  });
  it('a vehicle passing with no path conflict is not', () => {
    const g = gate((s) => s.env.vehicles.push({ id: 'v', kind: 'truck', pos: s.wearer.pos, vel: s.wearer.pos, bounds: { min: s.wearer.pos, max: s.wearer.pos } }));
    expect(g.safety).toBe(false);
  });
  it('conversation is the social gate', () => expect(gate((s) => (s.social.inConversation = true)).social).toBe(true));
  it('someone on the path is the path gate', () => {
    expect(gate((s) => s.env.people.push({ id: 'p', pos: s.wearer.pos, bounds: { min: s.wearer.pos, max: s.wearer.pos }, facing: false, onPath: true, ahead: 5 })).path).toBe(true);
  });
  it('snooze and an empty budget are gates', () => {
    const g = gate(() => {}, { snoozed: true, budget: 0, forceSafety: false });
    expect([g.snooze, g.budgetEmpty]).toEqual([true, true]);
  });
});

describe('walking rules, unit level', () => {
  it('rule 1: the focus zone grows with the band', () => {
    expect(FOCUS_ZONE.stopped).toEqual({ w: 0.33, h: 0.4 });
    expect(FOCUS_ZONE.brisk).toEqual({ w: 0.52, h: 0.58 });
  });

  it('rule 2: copy counts a unit with its number and trims by rule, never with an ellipsis', () => {
    expect(countCopy('3 min wait · 9 seats')).toEqual({ words: 2, numbers: 2 });
    const r = { kind: 'goal' as const, text: 'Short wait, on your side of the street', parts: [] };
    expect(countCopy('M4 in 2')).toEqual({ words: 2, numbers: 1 });
    const say = 'Fastest lunch on this side · 3 min, 9 seats';
    const c = trimForPace({ name: "Goldie's Counter", say, reason: r }, 'walk', '3 min, 9 seats', cfg);
    expect(c.say).toBeUndefined();
    expect(c.fact).toBe('3 min');
    expect(c.showReason).toBe(false);
    expect(trimForPace({ name: "Goldie's Counter", say, reason: r }, 'stopped', '3 min, 9 seats', cfg).say).toBe(say);
    expect(JSON.stringify(c)).not.toContain('…');
  });

  it('rule 3 and rule 10: a proactive label auto-folds; a card the look has left shrinks to its label', () => {
    const it0 = { ...newLadderItem('x'), level: 'label' as const, since: 0, shownAt: 0 };
    const inp = { t: 2.5, band: 'walk' as const, target: false, dwellS: 0, pinch: false, floor: 'pip' as const, labelled: false, proactive: true, scoreAbove: true, canProactive: true };
    expect(step(it0, inp, cfg).via).toBe('auto-fold');
    expect(step(it0, { ...inp, labelled: true }, cfg)).toMatchObject({ level: 'label', via: 'hold' });
    const dwelt = { ...it0, level: 'card' as const, dwelt: true, lastGazeAt: 1 };
    expect(step(dwelt, { ...inp, t: 2.2 }, cfg)).toMatchObject({ level: 'label', via: 'look-away' });
  });

  it('rule 10: a look lights the label, holds grow the card, and only Stopped or Stroll expand', () => {
    const climb = (band: 'stopped' | 'walk'): string[] => {
      let it = newLadderItem('x');
      const seen: string[] = [];
      for (let t = 0; t <= 3 + 1e-9; t += 0.1) {
        const out = step(it, { t, band, target: true, dwellS: t, pinch: false, floor: 'none', labelled: false, proactive: false, scoreAbove: false, canProactive: false }, cfg);
        if (out.level !== it.level) {
          seen.push(`${out.level}@${t.toFixed(1)}`);
          it = { ...it, level: out.level, since: t, cardAt: out.level === 'card' ? t : it.cardAt, gazeSince: 0 };
        }
      }
      return seen;
    };
    expect(climb('stopped')).toEqual(['label@0.3', 'card@0.8', 'expanded@2.8']);
    expect(climb('walk')).toEqual(['label@0.3', 'card@0.8']);
  });

  it('rule 6 and 7: the pocket holds an item once and surfaces only with 6 s or more', () => {
    const p = new Pocket();
    expect(p.save('mega-burger')).toBe(true);
    expect(p.save('mega-burger')).toBe(false);
    expect(p.shouldSurface(2, 12, false, cfg)).toBe(true);
    expect(p.shouldSurface(2, 5, false, cfg)).toBe(false);
    expect(p.shouldSurface(2, 12, true, cfg)).toBe(false);
  });

  it('rule 12: looking up, still, for two seconds snoozes (the glyph says so for the second one), and again cancels', () => {
    const spec: CaseSpec = { id: 's', scenario: 'walking', duration: 10, startN: 40, pace: [[0, 0]], pitch: [[1, 0.6], [3.3, 0], [5, 0.6], [7.3, 0]] };
    const brain = new Brain({ scenario: 'walking' });
    const frames = synthesize(spec).map((s) => brain.tick(s));
    expect(frames[19]!.glyph?.label).not.toBe('Snoozing');
    expect(frames[21]!.glyph?.label).toBe('Snoozing');
    expect(frames[29]!.gate.snooze).toBe(false);
    expect(frames[31]!.gate.snooze).toBe(true);
    expect(frames[69]!.gate.snooze).toBe(true);
    expect(frames[71]!.gate.snooze).toBe(false);
  });

  it('rule 12: dragging the view up to a tall building does not snooze', () => {
    const spec: CaseSpec = { id: 'd', scenario: 'walking', duration: 6, startN: 40, pace: [[0, 0]], pitch: [[1, 0.6], [1.5, 0.64], [2, 0.6], [2.5, 0.66], [3, 0.6], [3.5, 0.64], [4, 0.6], [4.5, 0.66], [5, 0]] };
    const brain = new Brain({ scenario: 'walking' });
    expect(synthesize(spec).some((s) => brain.tick(s).gate.snooze)).toBe(false);
  });

  it('rule 13: a show drains the budget and the meter counts it', () => {
    const brain = new Brain({ scenario: 'hungry' });
    let model = brain.model();
    for (const s of synthesize({ id: 'b', scenario: 'hungry', duration: 3, pace: [[0, 1.38]] })) model = brain.tick(s).model;
    expect(model.budgetUsed).toBe(1);
    expect(model.budget).toBe(cfg.budget.shows - 1);
  });

  it('a dismiss with no target steps the top pane down and logs dismiss as the cause', () => {
    const brain = new Brain({ scenario: 'hungry' });
    const events = [];
    for (const s of synthesize({ id: 'd', scenario: 'hungry', duration: 4, pace: [[0, 1.38]], dismiss: [[3, null]] })) events.push(...brain.tick(s).events);
    const step = events.find((d) => d.id === 'goldies-counter' && d.action === 'demote');
    expect(step?.cause).toBe('dismiss');
    expect(step?.level).toBe('pip');
  });
});

describe('the head-moved gate', () => {
  const spec: CaseSpec = { id: 'lap-still', scenario: 'walking', duration: 5, startN: 20, only: ['grace-theater'], pace: [[0, 0]], yaw: [[0, 0], [0.5, 0.2]], gaze: [[3, 'grace-theater']] };
  const levels = (lap: boolean): string[] => {
    const brain = new Brain({ scenario: 'walking' });
    const out: string[] = [];
    for (const s of synthesize(spec)) {
      if (lap && s.t >= 2) s.goal.lap = 1;
      for (const d of brain.tick(s).events) if (d.id === 'grace-theater') out.push(d.level);
    }
    return out;
  };

  it('starts again with every lap: a look grows to a card only once the head has moved since the lap began', () => {
    expect(levels(false)).toContain('card');
    expect(levels(true)).not.toContain('card');
    expect(levels(true)).toContain('label');
  });
});

describe('a reply changes the walk', () => {
  const lunch = WALK.beats.find((b) => b.kind === 'inbox' && b.id === 'maya-lunch');
  const replies = lunch && lunch.kind === 'inbox' ? lunch.replies! : [];
  const run = (reply: string): { t: number; note?: string; route?: string }[] => {
    const spec: CaseSpec = { id: 'reply', scenario: 'hungry', duration: 30, pace: [[0, 0]], inbox: [{ t: 1, id: 'maya-lunch', type: 'text', from: 'Maya', text: 'Lunch?' }], choice: [[3, 'maya-lunch', reply]] };
    const spec2 = replies.find((r) => r.id === reply)!;
    const brain = new Brain({ scenario: 'hungry' });
    const out: { t: number; note?: string; route?: string }[] = [];
    for (const s of synthesize(spec)) {
      const n = s.inbox.find((m) => m.id === 'maya-lunch');
      if (n) {
        n.replies = replies;
        n.thread = [{ me: false, text: 'Lunch?', at: 1 }];
        if (s.t >= 3) n.thread.push({ me: true, text: spec2.label, at: 3 });
        if (spec2.answer && s.t >= 3 + spec2.answer.after) n.thread.push({ me: false, text: spec2.answer.text, at: 3 + spec2.answer.after });
      }
      const f = brain.tick(s);
      const d = f.items.find((x) => x.id === 'maya-lunch');
      const row: { t: number; note?: string; route?: string } = { t: s.t };
      if (d?.content.note) row.note = d.content.note;
      if (f.goal.destination) row.route = f.goal.destination;
      out.push(row);
    }
    return out;
  };

  it('Where exactly? offers the route only once the answer has arrived', () => {
    const rows = run('where');
    const first = rows.find((r) => r.note?.endsWith('route there?'));
    expect(first?.t).toBeGreaterThanOrEqual(23);
    expect(first!.t).toBeLessThan(24);
  });

  it("Can't today offers nothing and routes nowhere", () => {
    const rows = run('cant');
    expect(rows.some((r) => r.note || r.route)).toBe(false);
  });
});

