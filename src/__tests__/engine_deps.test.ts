// PERMANENT dependency-direction guard (extraction plan, Iron Rule 2): src/engine/**
// may never import from src/store/, src/screens/, React, or Zustand — directly OR
// transitively. The engine must stay importable in bare Node with no React/Zustand
// in its transitive graph. Any violation (including future ones) fails here.
//
// Every src file is glob'd as raw text (the repo idiom — see replay.test.ts) and the
// import graph is walked from the engine files, so a violation buried two hops deep
// (e.g. engine → data → some React util) fails just as loudly as a direct one.
import { describe, it, expect } from 'vitest';

const RAW = import.meta.glob('../**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
// Keys arrive as '../engine/index.ts' — normalize to src-relative ('engine/index.ts').
const FILES = new Map(Object.entries(RAW).map(([k, v]) => [k.replace(/^\.\.\//, ''), v]));

const FORBIDDEN_PACKAGES = ['react', 'react-dom', 'zustand'];
const FORBIDDEN_DIRS = ['store/', 'screens/'];

/** Every module specifier a file imports/re-exports (static forms). */
function specifiersOf(src: string): string[] {
  const specs: string[] = [];
  for (const m of src.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) specs.push(m[1]); // side-effect imports
  return specs;
}

/** Resolve a relative specifier against the file map, the way the bundler does. */
function resolveRelative(fromKey: string, spec: string): string | null {
  const parts = fromKey.split('/').slice(0, -1); // dir of the importing file
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const base = parts.join('/');
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (FILES.has(cand)) return cand;
  }
  return null;
}

function isForbiddenPackage(spec: string): boolean {
  return FORBIDDEN_PACKAGES.some(p => spec === p || spec.startsWith(`${p}/`));
}

describe('engine dependency direction', () => {
  it('src/engine/** imports nothing from store/screens/React/Zustand — transitively', () => {
    const violations: string[] = [];
    const queue = [...FILES.keys()].filter(k => k.startsWith('engine/'));
    expect(queue.length).toBeGreaterThan(0); // the engine exists (barrel at minimum)
    const visited = new Set<string>(queue);

    while (queue.length) {
      const file = queue.shift()!;
      for (const spec of specifiersOf(FILES.get(file)!)) {
        if (isForbiddenPackage(spec)) {
          violations.push(`src/${file} imports forbidden package "${spec}"`);
          continue;
        }
        if (!spec.startsWith('.')) continue; // other bare packages: not in scope of the rule
        const target = resolveRelative(file, spec);
        if (!target) {
          // JSON / assets resolve outside the ts/tsx map — only ts imports are walked.
          if (/\.(json|css|svg|png)$/.test(spec)) continue;
          violations.push(`src/${file} imports unresolvable "${spec}"`);
          continue;
        }
        if (FORBIDDEN_DIRS.some(d => target.startsWith(d))) {
          violations.push(`src/${file} imports "${spec}" → src/${target} (store/screens are off-limits to the engine)`);
          continue;
        }
        if (!visited.has(target)) { visited.add(target); queue.push(target); }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
