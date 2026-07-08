import { useSyncExternalStore, useState, type CSSProperties } from 'react';
import { recorder } from '../../replay/recorder';
import { downloadReplay } from '../../replay/download';
import { btnProps } from '../../lib/a11y';
import { TBL } from '../../tokens';

/**
 * Unobtrusive replay-recorder chip (bottom-left of the board). Recording is a pure append —
 * validity is decided at DOWNLOAD time by replaying the log. Clicking the chip validates +
 * downloads; if validation fails, the error (which names the first diverging field, plus
 * hashes) is shown in a COPYABLE panel with a Copy button — those hashes are impossible to
 * transcribe by hand, so this makes them one click to copy.
 */
export function RecorderButton() {
  const status = useSyncExternalStore(recorder.subscribe, recorder.getStatus, recorder.getStatus);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!status.recording) return null;

  const blocked = !!status.invalidReason;
  // A demotion means a store action was wired straight as a DOM handler, so it recorded as a
  // full-state paste instead of a re-executable action: the log stays CORRECT but that reducer
  // is never re-run on replay. Surface it — a silent fidelity loss is worse than a loud one.
  const demoted = status.demotions > 0;
  const label = blocked
    ? '⚠ can’t record'
    : `⏺ REC · ${status.steps} actions · ${status.turns} turns${demoted ? ` · ⚠ ${status.demotions} demoted` : ''}`;
  const title = blocked
    ? status.invalidReason
    : demoted
      ? `${status.demotions} action(s) demoted to state-pastes by a leaked handler argument — those reducers won't re-execute on replay. Fix the bare onClick={action} call site (use onClick={() => action()}), then re-record.`
      : 'Validate (replay) and download this game as a .replay.json regression fixture';

  const onClick = () => {
    const res = downloadReplay();
    if (res.ok) { setErr(null); return; }
    console.error('[replay export failed]\n' + res.error);   // also copyable from devtools
    setErr(res.error);
    setCopied(false);
  };

  const copy = () => {
    if (!err) return;
    navigator.clipboard?.writeText(err).then(() => setCopied(true)).catch(() => {});
  };

  return (
    <>
      <div
        {...(blocked ? {} : btnProps(onClick))}
        title={title}
        style={{ ...chip, ...(blocked ? chipBad : demoted ? chipWarn : chipOk), cursor: blocked ? 'default' : 'pointer' }}
      >
        {label}
        {!blocked && <span style={dl}>⭳</span>}
      </div>

      {err && (
        <div style={panel}>
          <div style={panelHead}>
            <span style={{ color: TBL.danger, fontWeight: 600 }}>Replay export failed</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button {...btnProps(copy)} style={smallBtn}>{copied ? '✓ Copied' : '⧉ Copy'}</button>
              <button {...btnProps(() => setErr(null))} style={smallBtn}>✕</button>
            </div>
          </div>
          <textarea readOnly value={err} onFocus={e => e.currentTarget.select()} style={errBox} />
        </div>
      )}
    </>
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
/** Recording is valid but has lost re-execution fidelity (accidental action→paste demotions). */
const chipWarn: CSSProperties = {
  background: 'rgba(38,28,10,0.92)', border: `1px solid ${TBL.amber2}66`, color: TBL.amber2,
};
const dl: CSSProperties = { fontSize: 12, color: TBL.amber2 };

const panel: CSSProperties = {
  position: 'fixed', left: 12, bottom: 44, zIndex: 61, width: 'min(560px, 90vw)',
  background: 'rgba(18,13,10,0.98)', border: `1px solid ${TBL.danger}66`, borderRadius: 9,
  padding: 10, boxShadow: '0 6px 28px rgba(0,0,0,0.6)',
  fontFamily: "'Inter', sans-serif", fontSize: 12,
};
const panelHead: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
};
const smallBtn: CSSProperties = {
  padding: '3px 9px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  background: 'rgba(255,255,255,0.06)', color: TBL.ink, border: `1px solid ${TBL.matLine2}`,
  fontFamily: "'Inter', sans-serif",
};
const errBox: CSSProperties = {
  width: '100%', height: 120, resize: 'vertical', boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.45)', color: TBL.ink, border: `1px solid ${TBL.matLine}`,
  borderRadius: 5, padding: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
  lineHeight: 1.5, whiteSpace: 'pre', outline: 'none',
};
