import { tryExport } from './exportReplay';
import type { ReplayLog } from './format';

function turnsOf(log: ReplayLog): number {
  return log.entries.reduce((m, e) => Math.max(m, e.turn?.turn ?? 0), log.init.game.turn);
}

/** Validate (via replay) + download the current recording as a .replay.json file. Returns
 *  `{ ok: false, error }` when there is no recording or the log fails to replay clean — the
 *  caller shows the reason. */
export function downloadReplay(): { ok: true } | { ok: false; error: string } {
  const res = tryExport();
  if (!res.ok) return res;
  const log = res.log;
  // recordedAt (base36) uniquifies the name: two same-turn-count games on the same
  // commit used to collide, and the browser's "(1)" suffix fell OUTSIDE the fixture
  // test glob — a fixture that sat in the folder while silently never running.
  const name = `twilight-${log.mode}-${log.commit}-t${turnsOf(log)}-${log.recordedAt.toString(36)}.replay.json`;
  // Strip the in-memory diagnostic `state` from action entries — fixtures replay by
  // re-execution, so this only bloats the file.
  const lean = { ...log, entries: log.entries.map(e => e.kind === 'action' ? { ...e, state: undefined } : e) };
  const blob = new Blob([JSON.stringify(lean, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { ok: true };
}
