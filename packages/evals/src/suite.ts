import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { synthesize, type CaseSpec, type WorldSnapshot, type ScenarioId } from '@lumen/shared';
import { withConfig, type ConfigOverride } from '@lumen/brain';
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
    .map((f) => ({ id: f.replace('.walk.json', ''), file: readJson<WalkFile>(join(dir, f)) }));
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
