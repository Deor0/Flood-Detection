#!/usr/bin/env node
/**
 * One-time builder for the public demo (/demo). Run it by hand when you want fresher saved data:
 *
 *   node scripts/build-demo.mjs
 *
 * For each preset river it saves, as plain static files under public/geo/demo/<slug>/:
 *   flood.json              the exact body GET /api/flood would return (same code, run here)
 *   dem/<z>/<x>/<y>.png     the Terrarium terrain tiles the water fill needs
 * plus public/geo/demo/index.json listing the presets and the "as of" date.
 *
 * It reuses the real server code: src/app/api/flood/route.ts and src/model/*.ts are transpiled on
 * the fly with the `typescript` package that is already a dev dependency (nothing is added to
 * package.json), and Clerk is swapped for a stub that says "signed in". It makes only public,
 * keyless requests (Open-Meteo, Nominatim, AWS Terrarium) and sends no private data.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public', 'geo', 'demo');
const require = createRequire(import.meta.url);
const ts = require('typescript');

/** Terrain window: matches the dashboard (zoom 12) with a little spare so a larger window still works. */
const Z = 12;
const HALF_WIDTH_KM = 6;
const TILE_URL = (z, x, y) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const PRESETS = [
  {
    slug: 'bagmati-kathmandu',
    name: 'Bagmati, Kathmandu',
    lat: 27.7,
    lng: 85.32,
    note: 'Nepal. Mountain river through a dense valley city.',
  },
  {
    slug: 'trishuli-rasuwa',
    name: 'Trishuli, Rasuwa',
    lat: 28.17,
    lng: 85.33,
    note: 'Nepal. Steep Himalayan valley, near the 26 Aug 2026 event.',
  },
  {
    slug: 'mississippi-st-louis',
    name: 'Mississippi, St Louis',
    lat: 38.63,
    lng: -90.18,
    note: 'USA. A very large, slow river with a wide floodplain.',
  },
  {
    slug: 'rhine-cologne',
    name: 'Rhine, Cologne',
    lat: 50.94,
    lng: 6.96,
    note: 'Germany. Large river through a city.',
  },
  {
    slug: 'indus-sukkur',
    name: 'Indus, Sukkur',
    lat: 27.7,
    lng: 68.86,
    note: 'Pakistan. Huge, flat floodplain, hit by the 2022 floods.',
  },
];

// ---------- run the real TypeScript from src/ without a bundler ----------

/** Transpile one file (and, recursively, its imports) into a temp folder; returns the output path. */
async function transpileTree(entry, outDir) {
  const done = new Map();

  async function visit(file) {
    if (done.has(file)) return done.get(file);
    const rel = path.relative(SRC, file).replace(/\.tsx?$/, '.mjs');
    const target = path.join(outDir, rel);
    done.set(file, target);
    const code = await readFile(file, 'utf8');
    const { outputText } = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues?.Remove,
      },
      fileName: file,
    });

    const specs = [...outputText.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    let rewritten = outputText;
    for (const spec of new Set(specs)) {
      if (spec === '@clerk/nextjs/server') {
        const stub = path.join(outDir, '__clerk-stub.mjs');
        await mkdir(path.dirname(stub), { recursive: true });
        await writeFile(
          stub,
          "export async function auth() { return { userId: 'demo-builder' }; }\n",
        );
        rewritten = rewritten
          .replaceAll(`'${spec}'`, `'${relativeImport(target, stub)}'`)
          .replaceAll(`"${spec}"`, `"${relativeImport(target, stub)}"`);
        continue;
      }
      let source = null;
      if (spec.startsWith('@/')) source = path.join(SRC, spec.slice(2));
      else if (spec.startsWith('.')) source = path.resolve(path.dirname(file), spec);
      if (!source) continue; // bare package (node built-in or dependency): leave alone
      const candidate = ['.ts', '.tsx', '/index.ts'].map((ext) => source + ext).find(existsSync);
      if (!candidate) continue;
      const child = await visit(candidate);
      const replacement = relativeImport(target, child);
      rewritten = rewritten
        .replaceAll(`'${spec}'`, `'${replacement}'`)
        .replaceAll(`"${spec}"`, `"${replacement}"`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, rewritten);
    return target;
  }

  return visit(entry);
}

function relativeImport(from, to) {
  let rel = path.relative(path.dirname(from), to).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

// ---------- tiles ----------

function presetInfo(p) {
  return { slug: p.slug, name: p.name, lat: p.lat, lng: p.lng, note: p.note };
}

async function countTiles(dir) {
  const { readdir } = await import('node:fs/promises');
  let n = 0;
  for (const x of await readdir(dir)) n += (await readdir(path.join(dir, x))).length;
  return n;
}

/** A tiny Open-Meteo request: true when it answers with an hourly or daily limit message. */
async function limitHit() {
  try {
    const res = await fetch(
      'https://flood-api.open-meteo.com/v1/flood?latitude=0&longitude=0&daily=river_discharge&forecast_days=1',
      { signal: AbortSignal.timeout(15_000) },
    );
    if (res.status === 200) return false;
    return /hourly|daily|limit/i.test(await res.text());
  } catch {
    return false;
  }
}

async function fetchTile(z, x, y) {
  const file = path.join(OUT, '__tiles__', String(z), String(x), `${y}.png`);
  if (existsSync(file)) return file;
  const res = await fetch(TILE_URL(z, x, y), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Terrain tile ${z}/${x}/${y} failed (${res.status})`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function main() {
  // Inside the project so the transpiled code can resolve the project's packages (drizzle-orm etc.).
  const tmp = await mkdtemp(path.join(ROOT, '.demo-build-'));
  try {
    const routeFile = await transpileTree(path.join(SRC, 'app/api/flood/route.ts'), tmp);
    const terrariumFile = await transpileTree(path.join(SRC, 'model/terrarium.ts'), tmp);
    const { GET } = await import(pathToFileURL(routeFile).href);
    const { tilesForWindow } = await import(pathToFileURL(terrariumFile).href);

    await mkdir(OUT, { recursive: true });

    const index = [];
    let totalBytes = 0;
    const force = process.argv.includes('--force');
    for (const preset of PRESETS) {
      const done = path.join(OUT, preset.slug, 'flood.json');
      if (!force && existsSync(done) && existsSync(path.join(OUT, preset.slug, 'dem'))) {
        console.log(`${preset.slug}: already saved, skipping (use --force to refresh)`);
        const saved = JSON.parse(await readFile(done, 'utf8'));
        const tilesDir = path.join(OUT, preset.slug, 'dem', String(Z));
        const xs = existsSync(tilesDir) ? await countTiles(tilesDir) : 0;
        index.push({
          ...presetInfo(preset),
          tiles: xs,
          zoom: Z,
          savedAt: (await stat(done)).mtime.toISOString(),
        });
        totalBytes += Buffer.byteLength(JSON.stringify(saved));
        continue;
      }
      process.stdout.write(`${preset.slug}: flood data… `);
      // Open-Meteo's free tier can answer 502/429 after a heavy request: wait and retry.
      let response;
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        response = await GET(
          new Request(`http://localhost/api/flood?lat=${preset.lat}&lng=${preset.lng}`),
        );
        if (response.status === 200) break;
        const why = await response.text();
        process.stdout.write(`(try ${attempt}: ${response.status} ${why.slice(0, 80)}) `);
        // Open-Meteo's hourly/daily limits cannot be waited out in a script: stop and say so.
        if (await limitHit()) {
          console.log(
            '\nOpen-Meteo says the request limit is used up for now. Saved presets are kept; run this script again later (it skips what is already saved).',
          );
          process.exit(2);
        }
        await new Promise((r) => setTimeout(r, 70_000)); // per-minute limit: wait a full minute
      }
      if (response.status !== 200) {
        throw new Error(`${preset.slug}: /api/flood logic returned ${response.status}`);
      }
      const flood = await response.json();
      const dir = path.join(OUT, preset.slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'flood.json'), `${JSON.stringify(flood)}\n`);

      // Terrain for the click and for the snapped river cell (the desk may centre on either).
      const centres = [{ lat: preset.lat, lng: preset.lng }];
      if (flood.snapped) centres.push(flood.snapped);
      const seen = new Set();
      const tiles = [];
      for (const c of centres) {
        for (const t of tilesForWindow(c.lat, c.lng, HALF_WIDTH_KM, Z)) {
          const key = `${t.x}/${t.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            tiles.push(t);
          }
        }
      }
      process.stdout.write(`${tiles.length} terrain tiles… `);
      let bytes = 0;
      for (const t of tiles) {
        const cached = await fetchTile(Z, t.x, t.y);
        const target = path.join(dir, 'dem', String(Z), String(t.x), `${t.y}.png`);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, await readFile(cached));
        bytes += (await stat(target)).size;
      }
      totalBytes += bytes + Buffer.byteLength(JSON.stringify(flood));
      console.log(`${(bytes / 1024).toFixed(0)} KB`);
      index.push({
        ...presetInfo(preset),
        tiles: tiles.length,
        zoom: Z,
        savedAt: new Date().toISOString(),
      });
      // Open-Meteo limits requests per minute and the 9-cell 1984-to-today call is heavy: space presets out.
      await new Promise((r) => setTimeout(r, 15_000));
    }

    await rm(path.join(OUT, '__tiles__'), { recursive: true, force: true });
    index.sort(
      (a, b) =>
        PRESETS.findIndex((p) => p.slug === a.slug) - PRESETS.findIndex((p) => p.slug === b.slug),
    );
    // "As of" is the oldest saved preset, so the label never overstates how fresh the data is.
    const asOf = index.map((p) => p.savedAt).sort()[0];
    await writeFile(
      path.join(OUT, 'index.json'),
      `${JSON.stringify({ asOf, zoom: Z, presets: index }, null, 2)}\n`,
    );
    console.log(
      `\nSaved ${index.length} presets, about ${(totalBytes / 1024 / 1024).toFixed(1)} MB.`,
    );
    console.log(`As of ${asOf}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
