import type { Band, Content } from '@lumen/shared';
import type { Config } from './config';

const UNITS = new Set(['min', 'mins', 's', 'sec', 'm', 'km', 'h', 'hr', 'am', 'pm', '%']);

export function countCopy(text: string): { words: number; numbers: number } {
  const tokens = text
    .replace(/·/g, ' ')
    .split(/\s+/)
    .map((x) => x.replace(/[.,?!]$/, ''))
    .filter(Boolean);
  let words = 0;
  let numbers = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (/\d/.test(tok)) {
      numbers++;
      const next = tokens[i + 1]?.toLowerCase();
      if (next && UNITS.has(next)) i++;
    } else if (/^[$€£]+$/.test(tok)) {
      continue;
    } else {
      words++;
    }
  }
  return { words, numbers };
}

export function readingMs(text: string, cfg: Config): number {
  const { words, numbers } = countCopy(text);
  return words * cfg.reading.wordMs + numbers * cfg.reading.numberMs;
}

function fitsCap(text: string, cfg: Config): boolean {
  const { words, numbers } = countCopy(text);
  return words <= cfg.reading.glanceWords && numbers <= cfg.reading.glanceNumbers;
}

export function trimForPace(
  content: Content,
  band: Band,
  viewS: number,
  short: string | undefined,
  cfg: Config,
): Content {
  if (band === 'stopped') return { ...content, showReason: true };
  const trimmed: string[] = [];
  let showReason = band === 'stroll';
  if (!showReason) trimmed.push('reason');
  let fact = content.fact;
  const budgetMs = viewS * 1000;
  const total = (): number => (fact ? readingMs(fact, cfg) : 0) + (showReason ? readingMs(content.reason.text, cfg) : 0);
  if (showReason && total() > budgetMs) {
    showReason = false;
    trimmed.push('reason');
  }
  if (fact && (!fitsCap(fact, cfg) || total() > budgetMs)) {
    const facts = fact.split(' · ');
    if (facts.length > 1) {
      trimmed.push(`fact: ${facts.slice(1).join(' · ')}`);
      fact = facts[0]!;
    }
    if (!fitsCap(fact, cfg) || total() > budgetMs) {
      if (short && fitsCap(short, cfg)) {
        trimmed.push(`fact: ${fact}`);
        fact = short;
      } else {
        trimmed.push(`fact: ${fact}`);
        fact = undefined;
      }
    }
  }
  const out: Content = { ...content, showReason, trimmed };
  if (fact === undefined) delete out.fact;
  else out.fact = fact;
  return out;
}
