import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASSETS = join(ROOT, 'apps/web/public/assets');
const RAW = join(ROOT, '.cache', 'assets-raw');

export const TEXTURES: Record<string, string> = {
  bricks085: 'Bricks085',
  bricks094: 'Bricks094',
  tiles143: 'Tiles143',
  granite002b: 'Granite002B',
  concrete034: 'Concrete034',
  concrete044d: 'Concrete044D',
  paintedplaster017: 'PaintedPlaster017',
  pavingstones136: 'PavingStones136',
  road012a: 'Road012A',
  facade001: 'Facade001',
  facade018a: 'Facade018A',
  facade020a: 'Facade020A',
  bark014: 'Bark014',
};

export const PEOPLE: Record<string, { id: string; title: string; clips: Record<'walk' | 'idle' | 'sit', string> }> = {
  'man-long-sleeves': { id: 'DLptRuewTn', title: 'Man in Long Sleeves', clips: { walk: 'Man_Walk', idle: 'Man_Idle', sit: 'Man_Sitting' } },
  'man-shirt': { id: 'HMnuH5geEG', title: 'Man', clips: { walk: 'Man_Walk', idle: 'Man_Idle', sit: 'Man_Sitting' } },
  'man-casual': { id: 'fjHyMd5Wxw', title: 'Man', clips: { walk: 'Man_Walk', idle: 'Man_Idle', sit: 'Man_Sitting' } },
  'man-suit': { id: 'mQnGoME1ez', title: 'Man in Suit', clips: { walk: 'Man_Walk', idle: 'Man_Idle', sit: 'Man_Sitting' } },
  'woman-casual': { id: 'jpKRgGDxhk', title: 'Woman Casual', clips: { walk: 'Female_Walk', idle: 'Female_Idle', sit: 'Female_Sitting' } },
  'woman-dress': { id: 'zMyPlQXBzq', title: 'Woman in Dress', clips: { walk: 'Female_Walk', idle: 'Female_Idle', sit: 'Female_Sitting' } },
  'woman-tank-top': { id: 'XqzeZGB7iU', title: 'Woman in Tank Top', clips: { walk: 'Female_Walk', idle: 'Female_Idle', sit: 'Female_Sitting' } },
  'business-man': { id: 'JFrLIKqvCH', title: 'Business Man', clips: { walk: 'Walk', idle: 'Idle', sit: 'Idle_Neutral' } },
  'worker': { id: 'Yg2bQZO6Hj', title: 'Worker', clips: { walk: 'Walk', idle: 'Idle', sit: 'Idle_Neutral' } },
  'hoodie': { id: 'gKLBoRsyKe', title: 'Hoodie Character', clips: { walk: 'Walk', idle: 'Idle', sit: 'Idle_Neutral' } },
  'casual': { id: 'kZ3DmIoGip', title: 'Casual Character', clips: { walk: 'Walk', idle: 'Idle', sit: 'Idle_Neutral' } },
  'woman-a': { id: 'nIItLV9nxS', title: 'Animated Woman', clips: { walk: 'Walk', idle: 'Idle', sit: 'Idle_Neutral' } },
  'woman-b': { id: 'qJ2gsTUBHL', title: 'Animated Woman', clips: { walk: 'Walk', idle: 'Idle', sit: 'Idle_Neutral' } },
  'woman-c': { id: '9kF7eTDbhO', title: 'Animated Woman', clips: { walk: 'Walking', idle: 'Idle', sit: 'SitIdle' } },
};

export const CARS: Record<string, { id: string; title: string }> = {
  'sedan-a': { id: 'Cz6yDaUcM9', title: 'Car' },
  'sedan-b': { id: 'unqqkULtRU', title: 'Car' },
  taxi: { id: 'x43lOScTpN', title: 'Taxi' },
  suv: { id: 'xsMtZhBkxL', title: 'SUV' },
  pickup: { id: 'qn4grQgHm8', title: 'Pickup Truck' },
  truck: { id: 'cXw6oiFtZ8', title: 'Truck' },
  police: { id: 'BwwnUrWGmV', title: 'Police Car' },
};

async function fetchTo(url: string, path: string): Promise<void> {
  if (existsSync(path)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

async function polyGlb(id: string): Promise<string> {
  const html = await (await fetch(`https://poly.pizza/m/${id}`)).text();
  const m = html.match(/"model":\{.{0,900}/);
  const licence = m?.[0].match(/"Licence":"([^"]+)"/)?.[1] ?? '';
  if (!licence.startsWith('CC0')) throw new Error(`poly.pizza ${id} is not CC0 (${licence})`);
  const url = html.match(/https:\/\/static\.poly\.pizza\/[a-z0-9-]+\.glb/)?.[0];
  if (!url) throw new Error(`poly.pizza ${id}: no glb`);
  return url;
}

function sips(src: string, dst: string, size: number): void {
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', String(size), src, '--out', dst], { stdio: 'ignore' });
}

async function textures(): Promise<void> {
  const out = join(ASSETS, 'tex');
  mkdirSync(out, { recursive: true });
  for (const [name, id] of Object.entries(TEXTURES)) {
    const zip = join(RAW, `${id}.zip`);
    await fetchTo(`https://ambientcg.com/get?file=${id}_2K-JPG.zip`, zip);
    const dir = join(RAW, id);
    rmSync(dir, { recursive: true, force: true });
    execFileSync('unzip', ['-qo', zip, '-d', dir]);
    for (const [suffix, kind, size] of [
      ['Color', 'color', 1024],
      ['NormalGL', 'normal', 1024],
      ['Roughness', 'rough', 512],
      ['AmbientOcclusion', 'ao', 512],
    ] as const) {
      const src = readdirSync(dir).find((f) => f.endsWith(`_${suffix}.jpg`));
      if (src) sips(join(dir, src), join(out, `${name}_${kind}.jpg`), size);
    }
  }
}

async function models(): Promise<void> {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const process = async (src: string, dst: string, keep?: Record<string, string>): Promise<void> => {
    const doc = await io.read(src);
    const root = doc.getRoot();
    if (keep) {
      const wanted = Object.values(keep);
      for (const anim of root.listAnimations()) {
        const short = anim.getName().split('|').pop()!;
        const role = Object.entries(keep).find(([, v]) => v === short)?.[0];
        if (!wanted.includes(short) || !role) anim.dispose();
        else anim.setName(role);
      }
    } else {
      for (const anim of root.listAnimations()) anim.dispose();
    }
    await doc.transform(dedup(), prune(), resample(), weld(), quantize());
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    await io.write(dst, doc);
  };
  for (const [kind, table] of [
    ['people', PEOPLE],
    ['cars', CARS],
  ] as const) {
    mkdirSync(join(ASSETS, kind), { recursive: true });
    for (const [name, entry] of Object.entries(table)) {
      const raw = join(RAW, `${entry.id}.glb`);
      await fetchTo(await polyGlb(entry.id), raw);
      await process(raw, join(ASSETS, kind, `${name}.glb`), 'clips' in entry ? (entry.clips as Record<string, string>) : undefined);
      console.log(`${kind}/${name}.glb`);
    }
  }
}

mkdirSync(RAW, { recursive: true });
const which = process.argv[2] ?? 'all';
if (which === 'all' || which === 'textures') await textures();
if (which === 'all' || which === 'models') await models();
