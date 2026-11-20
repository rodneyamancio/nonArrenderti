import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = new URL('../../src/', import.meta.url);
const isFile = url => { const path = fileURLToPath(url); return existsSync(path) && statSync(path).isFile(); };

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  const alias = specifier.startsWith('@/');
  if ((relative || alias) && !/\.[cm]?[jt]s$/.test(specifier)) {
    const base = alias ? new URL(specifier.slice(2), src) : new URL(specifier, context.parentURL);
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = new URL(base.href + suffix);
      if (isFile(candidate)) return next(candidate.href, context);
    }
  }
  if (alias) return next(pathToFileURL(fileURLToPath(new URL(specifier.slice(2), src))).href, context);
  return next(specifier, context);
}
