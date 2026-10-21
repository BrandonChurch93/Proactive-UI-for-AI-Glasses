import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SuiteResult } from './suite';

export interface Report {
  version: 1;
  totals: { suites: number; passed: number; cases: number; casesPassed: number };
  byGroup: Record<string, { suites: number; passed: number }>;
  suites: SuiteResult[];
}

export function buildReport(suites: SuiteResult[]): Report {
  const byGroup: Report['byGroup'] = {};
  for (const s of suites) {
    const g = (byGroup[s.group] ??= { suites: 0, passed: 0 });
    g.suites++;
    if (s.pass) g.passed++;
  }
  const cases = suites.flatMap((s) => s.results);
  return {
    version: 1,
    totals: { suites: suites.length, passed: suites.filter((s) => s.pass).length, cases: cases.length, casesPassed: cases.filter((c) => c.pass).length },
    byGroup,
    suites,
  };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function writeReport(dir: string, r: Report): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'latest.json'), JSON.stringify(r, null, 1) + '\n');
  const rows = r.suites
    .map((s) => {
      const fails = s.results.filter((c) => !c.pass);
      const detail = fails.length
        ? `<ul>${fails.map((c) => `<li><b>${esc(c.rule ?? '')}</b> ${esc(c.name)}<br><code>${esc(c.detail)}</code></li>`).join('')}</ul>`
        : '';
      return `<tr class="${s.pass ? 'ok' : 'bad'}"><td>${esc(s.group)}</td><td>${esc(s.id)}</td><td>${esc(s.rule ?? '')}</td><td>${s.results.filter((c) => c.pass).length} / ${s.results.length}</td><td>${s.pass ? 'pass' : 'fail'}${detail}</td></tr>`;
    })
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Evals · Proactive UI for AI Glasses</title>
<style>body{background:#0e1216;color:#e9ebee;font:14px/1.5 "Instrument Sans",system-ui,sans-serif;margin:32px}h1{font-weight:500;font-size:20px}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #1d2228;padding:8px 10px;text-align:left;vertical-align:top}th{color:#8e96a1;font-weight:500}tr.bad td:last-child{color:#ff8f7a}tr.ok td:last-child{color:#9ff0bd}code{color:#8e96a1;font:12px "Martian Mono",ui-monospace,monospace}.sum{font:12px "Martian Mono",ui-monospace,monospace;color:#f0b429}</style>
<h1>Evals</h1><p class="sum">${r.totals.passed} / ${r.totals.suites} suites · ${r.totals.casesPassed} / ${r.totals.cases} checks</p>
<table><tr><th>Group</th><th>Case</th><th>Rule</th><th>Checks</th><th>Result</th></tr>${rows}</table>`;
  writeFileSync(join(dir, 'latest.html'), html);
}
