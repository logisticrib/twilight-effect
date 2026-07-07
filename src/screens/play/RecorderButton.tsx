import { useSyncExternalStore, type CSSProperties } from 'react';
import { recorder } from '../../replay/recorder';
import { downloadReplay } from '../../replay/download';
import { btnProps } from '../../lib/a11y';
import { TBL } from '../../tokens';

/**
 * Unobtrusive replay-recorder status chip (bottom-left of the board). Reflects the recorder
 * live via useSyncExternalStore: shows the running step/turn counts while recording, flips to
 * an "invalidated" warning (with the reason) the instant drift trips — so a long game's export
 * refusal is visible immediately, not discovered at game-over. Click to download the log.
 */
export function RecorderButton() {
  const status = useSyncExternalStore(recorder.subscribe, recorder.getStatus, recorder.getStatus);
  if (!status.recording) return null;

  const valid = status.valid;
  const label = valid
    ? `⏺ REC · ${status.steps} actions · ${status.turns} turns`
    : `⚠ invalidated`;
  const title = valid
    ? 'Download this game as a .replay.json regression fixture'
    : `Recording invalidated — ${status.reason ?? 'state changed outside a recorded action'}. Start a new sandbox game to record again.`;

  const onClick = () => { if (valid) downloadReplay(); };

  return (
    <div
      {...(valid ? btnProps(onClick) : {})}
      title={title}
      style={{ ...chip, ...(valid ? chipOk : chipBad), cursor: valid ? 'pointer' : 'default' }}
    >
      {label}
      {valid && <span style={dl}>⭳</span>}
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
