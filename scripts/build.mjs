import path from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');

const jsEntryPoints = [
  'background/background.js',
  'content/content.js',
  'popup/popup.js'
];

const cssEntryPoints = [
  'content/styles.css',
  'popup/popup.css'
];

const staticFiles = [
  'manifest.json',
  'popup/popup.html'
];

const staticDirs = [
  'data',
  'icons'
];

function abs(relativePath) {
  return path.join(projectRoot, relativePath);
}

async function copyStaticAssets() {
  for (const file of staticFiles) {
    const source = abs(file);
    const destination = path.join(distDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }

  for (const directory of staticDirs) {
    const source = abs(directory);
    const destination = path.join(distDir, directory);
    await cp(source, destination, { recursive: true });
  }
}

async function buildScripts() {
  await build({
    entryPoints: jsEntryPoints.map(abs),
    outdir: distDir,
    outbase: projectRoot,
    bundle: true,
    minify: true,
    sourcemap: true,
    format: 'iife',
    target: ['chrome114'],
    logLevel: 'info'
  });
}

async function buildStyles() {
  await build({
    entryPoints: cssEntryPoints.map(abs),
    outdir: distDir,
    outbase: projectRoot,
    bundle: true,
    minify: true,
    sourcemap: true,
    target: ['chrome114'],
    logLevel: 'info'
  });
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await Promise.all([
    buildScripts(),
    buildStyles(),
    copyStaticAssets()
  ]);

  console.log('[build] Done. Load /dist in chrome://extensions.');
}

main().catch((error) => {
  console.error('[build] Failed:', error);
  process.exitCode = 1;
});
