import { useSyncExternalStore, type CSSProperties } from 'react';
import { recorder } from '../../replay/recorder';
import { downloadReplay } from '../../replay/download';
import { useGameStore } from '../../store/gameStore';
import { btnProps } from '../../lib/a11y';
import { TBL } from '../../tokens';

/**
 * Unobtrusive replay-recorder chip (bottom-left of the board). Recording is a pure append —
 * validity is decided at DOWNLOAD time by replaying the log (the deterministic oracle). So
 * the chip just shows the running action/turn counts; clicking it validates + downloads, and
 * a failed validation (or a hard boundary like resumeGame) surfaces as a toast.
 */
export function RecorderButton() {
  const status = useSyncExternalStore(recorder.subscribe, recorder.getStatus, recorder.getStatus);
  const pushToast = useGameStore(s => s.pushToast);
  if (!status.recording) return null;

  const blocked = !!status.invalidReason;
  const label = blocked ? '⚠ can’t record' : `⏺ REC · ${status.steps} actions · ${status.turns} turns`;
  const title = blocked
    ? status.invalidReason
    : 'Validate (replay) and download this game as a .replay.json regression fixture';

  const onClick = () => {
    const res = downloadReplay();
    if (!res.ok) pushToast(`Replay export failed: ${res.error}`);
  };

  return (
    <div
      {...(blocked ? {} : btnProps(onClick))}
      title={title}
      style={{ ...chip, ...(blocked ? chipBad : chipOk), cursor: blocked ? 'default' : 'pointer' }}
    >
      {label}
      {!blocked && <span style={dl}>⭳</span>}
    </div>
  );
}

const chip: CSSProperties = {
  position: 'fixed', left: 12, bottom: 12, zIndex: 60,
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '5px 10px', borderRadius: 7, userSelect: 'none',
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.08em',
  boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
};
const chipOk: CSSProperties = {
  background: 'rgba(20,16,10,0.9)', border: `1px solid ${TBL.matLine2}`, color: TBL.ink2,
};
const chipBad: CSSProperties = {
  background: 'rgba(40,18,14,0.92)', border: `1px solid ${TBL.danger}66`, color: TBL.danger,
};
const dl: CSSProperties = { fontSize: 12, color: TBL.amber2 };
