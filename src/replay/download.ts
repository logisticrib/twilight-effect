import { recorder } from './recorder';
import type { ReplayLog } from './format';

function turnsOf(log: ReplayLog): number {
  return log.entries.reduce((m, e) => Math.max(m, e.turn?.turn ?? 0), log.init.game.turn);
}

/** Export the current recording as a downloaded .replay.json file. Returns false (no-op) if
 *  there is no valid recording to export (the caller should disable the control + show why). */
export function downloadReplay(): boolean {
  const log = recorder.export();
  if (!log) return false;
  const name = `twilight-${log.mode}-${log.commit}-t${turnsOf(log)}.replay.json`;
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
