import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PLACES, hydrateSnapshot, reasonIsClean, synthesize, type CaseSpec, type CompactSnapshot, type RunExport, type WorldSnapshot, type ScenarioId } from '@lumen/shared';
import { countCopy, withConfig, type ConfigOverride } from '@lumen/brain';
import { evaluate, type CaseResult, type Expectation } from './expect';
import { invariants } from './invariants';
import { fingerprint, run, type RunResult } from './runner';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const GROUPS = ['gates', 'notifications', 'moments', 'walking'] as const;

export interface WalkFile {
  version: 1;
  scenario: ScenarioId;
  seed: number;
  hz: number;
  snapshots: WorldSnapshot[];
}

export interface SuiteResult {
  id: string;
  group: string;
  rule?: string;
  description?: string;
  pass: boolean;
  results: CaseResult[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadExpectation(id: string): Expectation | null {
  const p = join(ROOT, 'expectations', `${id}.expect.json`);
  return existsSync(p) ? readJson<Expectation>(p) : null;
}

export function listCases(): { group: string; spec: CaseSpec }[] {
  const out: { group: string; spec: CaseSpec }[] = [];
  for (const g of GROUPS) {
    const dir = join(ROOT, 'scenarios', g);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      out.push({ group: g, spec: readJson<CaseSpec>(join(dir, f)) });
    }
  }
  return out;
}

export function listWalks(): { id: string; file: WalkFile }[] {
  const dir = join(ROOT, 'scenarios');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.walk.json'))
    .sort()
    .map((f) => {
      const raw = readJson<Omit<WalkFile, 'snapshots'> & { snapshots: CompactSnapshot[] }>(join(dir, f));
      return { id: f.replace('.walk.json', ''), file: { ...raw, snapshots: raw.snapshots.map(hydrateSnapshot) } };
    });
}

function check(id: string, group: string, r: RunResult, again: RunResult, config?: ConfigOverride, meta: Partial<SuiteResult> = {}): SuiteResult {
  const cfg = withConfig(config);
  const results: CaseResult[] = [];
  results.push({
    name: 'determinism: two runs produce identical logs',
    rule: 'determinism',
    pass: fingerprint(r) === fingerprint(again),
    detail: '',
  });
  results.push(...invariants(r, cfg));
  const exp = loadExpectation(id);
  if (exp) results.push(...evaluate(r, exp));
  else results.push({ name: 'has an expectation file', pass: false, detail: `expectations/${id}.expect.json missing` });
  return { id, group, pass: results.every((x) => x.pass), results, ...meta };
}

export function runCase(spec: CaseSpec, group: string): SuiteResult {
  const snaps = synthesize(spec);
  const config = spec.config as ConfigOverride | undefined;
  const a = run(spec.id, snaps, spec.scenario, config);
  const b = run(spec.id, synthesize(spec), spec.scenario, config);
  const meta: Partial<SuiteResult> = {};
  if (spec.rule) meta.rule = spec.rule;
  if (spec.description) meta.description = spec.description;
  return check(spec.id, group, a, b, config, meta);
}

export function runWalk(id: string, file: WalkFile): SuiteResult {
  const a = run(id, file.snapshots, file.scenario);
  const b = run(id, file.snapshots, file.scenario);
  return check(id, 'walks', a, b, undefined, { description: `Recorded walk · ${file.snapshots.length} snapshots at ${file.hz} Hz` });
}

export function runExport(file: RunExport, name: string): SuiteResult {
  const snaps = file.snapshots.map(hydrateSnapshot);
  const a = run(name, snaps, file.scenario, undefined, file.overrides);
  const b = run(name, snaps, file.scenario, undefined, file.overrides);
  const replayed = JSON.stringify(a.entries.map((e) => [e.t, e.decision]));
  const exported = JSON.stringify(file.entries);
  const results: CaseResult[] = [
    {
      name: 'round trip: the runner reproduces the exported decision log',
      rule: 'determinism',
      pass: replayed === exported,
      detail: replayed === exported ? `${file.entries.length} decisions` : `exported ${file.entries.length}, replayed ${a.entries.length}`,
    },
    { name: 'determinism: two runs produce identical logs', rule: 'determinism', pass: fingerprint(a) === fingerprint(b), detail: '' },
    ...invariants(a, withConfig()),
  ];
  const exp = file.source === 'scripted' && file.overrides.length === 0 ? loadExpectation(file.scenario) : null;
  if (exp) results.push(...evaluate(a, exp));
  return {
    id: name,
    group: 'export',
    pass: results.every((x) => x.pass),
    results,
    description: `${file.source} ${file.scenario} run · ${file.snapshots.length} snapshots · ${file.overrides.length} overrides`,
  };
}

// Every line a place can say, whether or not a recorded walk happens to show it.
export function runData(): SuiteResult {
  const results: CaseResult[] = [];
  const add = (name: string, rule: string, bad: string[]): void => {
    results.push({ name, rule, pass: bad.length === 0, detail: bad.length ? bad.join('; ') : `${PLACES.length} places` });
  };
  const sayBad: string[] = [];
  for (const p of PLACES) {
    for (const [key, l] of Object.entries(p.say)) {
      if (!l) continue;
      if (l.line.length >= 60) sayBad.push(`${p.id} ${key} over 60: ${l.line}`);
      if (countCopy(l.line).numbers > 2) sayBad.push(`${p.id} ${key} more than two numbers: ${l.line}`);
      if (l.line.toLowerCase().includes(p.name.toLowerCase())) sayBad.push(`${p.id} ${key} repeats the name`);
      if (!reasonIsClean(l.line) || !reasonIsClean(l.short)) sayBad.push(`${p.id} ${key} banned word`);
    }
  }
  add('every say line in places.json is under 60 characters, holds at most two numbers, never repeats the name and never uses a banned word', 'copy', sayBad);
  add(
    'every live line in places.json fits the card in 28 characters',
    'copy',
    PLACES.filter((p) => p.card.live.length > 28).map((p) => `${p.id}: ${p.card.live}`),
  );
  const shapeBad: string[] = [];
  for (const p of PLACES) {
    const x = p.expanded;
    if (!p.depth) continue;
    if (!x) {
      shapeBad.push(`${p.id} has a depth and no expanded view`);
      continue;
    }
    if (x.rows.length === 0 || x.rows.length > 4) shapeBad.push(`${p.id} carries ${x.rows.length} rows`);
    const primary = x.actions.filter((a) => a.primary);
    if (p.id === 'pocket-park') {
      if (x.actions.length) shapeBad.push('pocket-park asks for an action');
      continue;
    }
    if (primary.length !== 1) shapeBad.push(`${p.id} has ${primary.length} primary actions`);
    if (!x.actions.some((a) => a.id === 'not-now')) shapeBad.push(`${p.id} has no Not now`);
    const choices = x.rows.filter((r) => r.act);
    if (choices.length ? choices.some((r) => !r.after) : !x.after?.[primary[0]?.id ?? '']) shapeBad.push(`${p.id} has no after line for its action`);
  }
  add('every place with a depth has one to four rows, one primary action, Not now and an after line for it; Pocket Park has rows and no action', 'choice', shapeBad);
  return { id: 'places', group: 'data', pass: results.every((r) => r.pass), results, description: 'Every place in data/places.json against the copy rules and the shape of an expanded view' };
}
