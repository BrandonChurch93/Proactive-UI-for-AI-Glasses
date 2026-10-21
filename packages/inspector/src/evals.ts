import s from './inspector.module.css';
import type { InspectorStore } from './store';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const GROUP_NAMES: Record<string, string> = {
  walks: 'Recorded walks',
  gates: 'Gates',
  notifications: 'Notifications',
  moments: 'Moments',
  walking: 'Walking rules',
};

export class Evals {
  readonly el: HTMLElement;

  constructor(store: InspectorStore) {
    this.el = el('div', s.panel);
    const r = store.report;
    if (!r) {
      this.el.appendChild(el('div', s.note, 'No eval report in this build. Run pnpm eval, then rebuild.'));
      return;
    }
    const total = el('div', s.kv);
    total.append(el('span', undefined, 'This build'), el('span', s.big, `${r.totals.passed}/${r.totals.suites}`));
    this.el.appendChild(total);
    const checks = el('div', s.kv);
    checks.append(el('span', undefined, 'Checks'), el('span', undefined, `${r.totals.casesPassed}/${r.totals.cases} pass`));
    this.el.appendChild(checks);
    for (const [g, v] of Object.entries(r.byGroup)) {
      this.el.appendChild(el('div', s.section, `${GROUP_NAMES[g] ?? g} · ${v.passed}/${v.suites}`));
      for (const suite of r.suites.filter((x) => x.group === g)) {
        const row = el('div', s.suite);
        const passed = suite.results.filter((c) => c.pass).length;
        const name = suite.id === store.scenario && g === 'walks' ? `${suite.id} · this walk` : suite.id;
        row.append(el('span', undefined, name), el('span', suite.pass ? s.pass : s.fail, `${passed}/${suite.results.length}`));
        const fails = suite.results.filter((c) => !c.pass);
        if (fails.length) {
          const ul = el('ul', s.fails);
          for (const f of fails) {
            const li = el('li');
            li.append(el('span', undefined, `${f.rule ? `[${f.rule}] ` : ''}${f.name} `), el('code', undefined, `packages/evals/expectations/${suite.id}.expect.json${f.detail ? ` · ${f.detail}` : ''}`));
            ul.appendChild(li);
          }
          row.appendChild(ul);
        }
        if (suite.description && g !== 'walks') row.title = suite.description;
        this.el.appendChild(row);
      }
    }
  }
}
