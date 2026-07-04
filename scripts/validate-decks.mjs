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
  if (problems.length) {
    console.error(`✗ deck validation failed — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${CATALOG.length} cards validate clean (both decks)`);
  }
} finally {
  await server.close();
}
