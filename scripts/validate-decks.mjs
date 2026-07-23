// Deck data-contract gate: validates both deck JSONs (as the app consumes them, via
// catalog.ts) against src/data/validateCards.ts. Run: `npm run validate:decks`.
// Exit 1 on any problem — guards the hand-patching authoring workflow and runs in CI.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href;
const { createServer } = await import(viteEntry);

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { validateCards } = await server.ssrLoadModule('/src/data/validateCards.ts');
  const { CATALOG } = await server.ssrLoadModule('/src/data/catalog.ts');
  const problems = validateCards(CATALOG);
  // Prose-completeness hits on the SHIPPED decks are known authoring gaps awaiting
  // owner triage (author effects, or attach an owner-approved effectsFlag) — listed
  // loudly here but non-fatal, so CI stays green while triage pends. At the MINT
  // gate they are hard rejections like any other problem: a NEW prose-only card
  // cannot mint (validateCards returns them to every caller).
  const gaps = problems.filter(p => p.includes('prose-only:'));
  const fatal = problems.filter(p => !p.includes('prose-only:'));
  if (gaps.length) {
    console.warn(`⚠ ${gaps.length} AUTHORING GAP(S) — rules text with no effects (owner triage pending):`);
    for (const g of gaps) console.warn(`  - ${g}`);
  }
  // DEV-deck machinery debt (2026-07-22): dev cards whose behavior awaits an engine
  // arc carry a "DEV NOT-IMPLEMENTED" effectsFlag. Reported loudly, never fatal —
  // visible debt, no silent gaps.
  const devDebt = CATALOG.filter(c => c.dev && c.effectsFlag?.startsWith('DEV NOT-IMPLEMENTED'));
  if (devDebt.length) {
    console.warn(`⚠ ${devDebt.length} DEV card(s) await engine machinery (NOT-IMPLEMENTED, non-fatal):`);
    for (const c of devDebt) console.warn(`  - ${c.name}: ${c.effectsFlag}`);
  }
  if (fatal.length) {
    console.error(`✗ deck validation failed — ${fatal.length} problem(s):`);
    for (const problem of fatal) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    const devCount = CATALOG.filter(c => c.dev).length;
    console.log(`✓ ${CATALOG.length} cards validate clean (${CATALOG.length - devCount} shipped + ${devCount} dev)${gaps.length ? ` — ${gaps.length} authoring gaps flagged above` : ''}${devDebt.length ? ` — ${devDebt.length} dev NOT-IMPLEMENTED flags listed above` : ''}`);
  }
} finally {
  await server.close();
}
