import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../../apps/web', import.meta.url));

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function ensureServer(url: string): Promise<ViteDevServer | null> {
  const origin = new URL(url).origin;
  if (await reachable(origin)) return null;
  const port = Number(new URL(url).port || 5173);
  const server = await createServer({
    root: webRoot,
    configFile: `${webRoot}/vite.config.ts`,
    server: { port, strictPort: true },
    logLevel: 'warn',
  });
  await server.listen();
  return server;
}

const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];

export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome', args: GPU_ARGS });
  } catch {
    return await chromium.launch({ args: GPU_ARGS });
  }
}

export const VIEWPORT = { width: 1280, height: 800 };

// The dev server reloads the page whenever a source changes (an editor's format-on-save lands a minute after an edit);
// a reload mid-walk restarts the walk, so a live run waits until the sources have been quiet this long.
export async function waitQuiet(seconds = 75): Promise<void> {
  const newest = (dir: string): number => {
    let m = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const f = join(dir, e.name);
      m = Math.max(m, e.isDirectory() ? newest(f) : statSync(f).mtimeMs);
    }
    return m;
  };
  const root = fileURLToPath(new URL('../..', import.meta.url));
  for (;;) {
    const quiet = (Date.now() - Math.max(newest(join(root, 'packages')), newest(join(root, 'apps/web/src')), newest(join(root, 'data')))) / 1000;
    if (quiet >= seconds) return;
    await new Promise((r) => setTimeout(r, (seconds - quiet) * 1000 + 500));
  }
}
