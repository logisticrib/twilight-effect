// Export-time validation: a recording is exportable iff it actually REPLAYS clean. Rather
// than a per-action hash proxy (which fired on benign React interleaving), we run the log
// through replay() in-process against the live store — the deterministic oracle for "is this
// a valid fixture" — restoring the live game afterwards so validation is non-destructive.
import { useGameStore } from '../store/gameStore';
import { recorder } from './recorder';
import { replay } from './replay';
import type { ReplayLog } from './format';

export type ExportResult = { ok: true; log: ReplayLog } | { ok: false; error: string };

export function tryExport(): ExportResult {
  const { log, reason } = recorder.getLog();
  if (!log) return { ok: false, error: reason ?? 'No recording to export.' };

  // Snapshot the whole live store (shallow is safe — store updates are immutable, so the
  // nested game graph is never mutated in place; replay() swaps in new objects). replay()
  // drives the singleton store; we restore right after, all synchronously (React only
  // re-renders after this returns, so it never sees the transient replay state).
  const snapshot = { ...useGameStore.getState() };
  try {
    replay(log); // throws ReplayDivergence / Error on any mismatch
    return { ok: true, log };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    useGameStore.setState(snapshot, true); // replace: restore the live game exactly
  }
}
