import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { join } from 'node:path';
import { SCENARIO_IDS, compactSnapshot, type RunExport } from '@lumen/shared';
import { recordWalk } from './record';
import { buildReport, writeReport } from './report';
import { listCases, listWalks, ROOT, runCase, runExport, runWalk, type SuiteResult } from './suite';

const argv = process.argv.slice(2);
const only = argv.includes('--walk') ? argv[argv.indexOf('--walk') + 1] : undefined;
const verbose = argv.includes('--verbose');
const file = argv.includes('--file') ? argv[argv.indexOf('--file') + 1] : undefined;

if (file) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as RunExport;
  if (data.kind !== 'lumen-run') {
    console.error(`${file} is not an inspector export`);
    process.exit(1);
  }
  const s = runExport(data, basename(file));
  console.log(`${s.pass ? 'pass' : 'FAIL'}  ${s.description}`);
  for (const c of s.results) if (!c.pass || verbose) console.log(`        ${c.pass ? 'ok ' : 'x  '} ${c.rule ? `[${c.rule}] ` : ''}${c.name}${c.detail ? `\n             ${c.detail}` : ''}`);
  console.log(`${s.results.filter((c) => c.pass).length}/${s.results.length} checks`);
  process.exit(s.pass ? 0 : 1);
}

if (!argv.includes('--no-record')) {
  for (const id of SCENARIO_IDS) {
    if (only && id !== only) continue;
    const walk = recordWalk(id);
    writeFileSync(join(ROOT, 'scenarios', `${id}.walk.json`), JSON.stringify({ ...walk, snapshots: walk.snapshots.map(compactSnapshot) }));
  }
}

const suites: SuiteResult[] = [];
for (const { id, file } of listWalks()) {
  if (only && id !== only) continue;
  suites.push(runWalk(id, file));
}
if (!only) for (const { group, spec } of listCases()) suites.push(runCase(spec, group));
else for (const { group, spec } of listCases()) if (spec.id === only) suites.push(runCase(spec, group));

const report = buildReport(suites);
writeReport(join(ROOT, 'report'), report);

for (const s of suites) {
  const passed = s.results.filter((c) => c.pass).length;
  console.log(`${s.pass ? 'pass' : 'FAIL'}  ${s.group.padEnd(13)} ${s.id.padEnd(30)} ${passed}/${s.results.length}`);
  for (const c of s.results) if (!c.pass || verbose) console.log(`        ${c.pass ? 'ok ' : 'x  '} ${c.rule ? `[${c.rule}] ` : ''}${c.name}${c.detail ? `\n             ${c.detail}` : ''}`);
}
console.log(`\n${report.totals.passed}/${report.totals.suites} suites, ${report.totals.casesPassed}/${report.totals.cases} checks`);
process.exit(report.totals.passed === report.totals.suites ? 0 : 1);
