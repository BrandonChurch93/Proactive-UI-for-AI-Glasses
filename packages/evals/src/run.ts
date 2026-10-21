import { join } from 'node:path';
import { buildReport, writeReport } from './report';
import { listCases, listWalks, ROOT, runCase, runWalk, type SuiteResult } from './suite';

const argv = process.argv.slice(2);
const only = argv.includes('--walk') ? argv[argv.indexOf('--walk') + 1] : undefined;
const verbose = argv.includes('--verbose');

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
