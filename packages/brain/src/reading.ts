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
    if (/^[$€£]?\d[\d:.,]*$/.test(tok)) {
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
  const out: Content = { ...content, showReason: false };
  if (band === 'stopped') return out;
  const trimmed: string[] = [];
  let fact = content.fact;
  if (band === 'stroll') {
    if (content.say && short && readingMs(content.say, cfg) > viewS * 1000) {
      trimmed.push(`say: ${content.say}`);
      delete out.say;
      fact = short;
    }
  } else {
    if (content.say) {
      trimmed.push(`say: ${content.say}`);
      delete out.say;
      if (short) fact = short;
    }
    if (fact && !fitsCap(fact, cfg)) {
      const first = fact.split(/ · |, /)[0]!;
      trimmed.push(`second fact: ${fact.slice(first.length).replace(/^( · |, )/, '')}`);
      fact = fitsCap(first, cfg) ? first : undefined;
    }
  }
  out.trimmed = trimmed;
  if (fact === undefined) delete out.fact;
  else out.fact = fact;
  return out;
}
