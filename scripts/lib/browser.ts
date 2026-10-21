import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
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
