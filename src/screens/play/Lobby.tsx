import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useDeckStore } from '../../store/deckStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CATALOG } from '../../data/catalog';
import { TBL } from '../../tokens';
import { btnProps } from '../../lib/a11y';
import type { Card } from '../../types/card';

interface LobbyProps {
  /** Host/join the PeerJS session — owned by Play() so it survives the view switch. */
  host: (myCards: Card[], oppCards: Card[]) => Promise<string>;
  /** Guest sends only its own deck; the host assembles both sides from the READY handshake. */
  join: (code: string, myCards: Card[]) => Promise<void>;
}

// Resolve a deck's card ID map → ordered Card array
function deckToCards(cards: Record<string, true>): Card[] {
  return Object.keys(cards)
    .map(id => CATALOG.find(c => c.id === id))
    .filter((c): c is Card => !!c);
}

const lb = {
  root: {
    flex: 1, minHeight: 0, overflow: 'hidden',
    background: `
      radial-gradient(ellipse 70% 50% at 50% 46%, ${TBL.matGlow}, transparent 70%),
      radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.5), transparent 55%),
      repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 7px),
      linear-gradient(160deg, ${TBL.mat2}, ${TBL.mat0})`,
    color: TBL.ink, display: 'flex', flexDirection: 'column',
  } as CSSProperties,
  body: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '0 26px', gap: 0,
  } as CSSProperties,
  opts: { display: 'grid', gridTemplateColumns: 'repeat(3, 252px)', gap: 12 } as CSSProperties,
  // `clickable` only for cards whose whole body is a click target (Sandbox) —
  // Host/Join act through their inner button/input, so a card-wide pointer lies.
  opt: (primary: boolean, clickable = false): CSSProperties => ({
    background: primary ? 'rgba(214,160,80,0.07)' : 'rgba(0,0,0,0.25)',
    border: `1px solid ${primary ? TBL.matLine2 : TBL.matLine}`,
    borderRadius: 10, padding: 18,
    display: 'flex', flexDirection: 'column', gap: 7,
    cursor: clickable ? 'pointer' : 'default', transition: 'border-color .15s',
  }),
  optGlyph: (c: string): CSSProperties => ({
    width: 34, height: 34, borderRadius: 7,
    background: `${c}22`, border: `1px solid ${c}66`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 17, color: c, fontFamily: "'Newsreader', serif",
  }),
  optTitle: { fontFamily: "'Newsreader', serif", fontSize: 17, fontWeight: 500, color: TBL.ink } as CSSProperties,
  optDesc: { fontSize: 12, color: TBL.ink2, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" } as CSSProperties,
  foot: {
    padding: '12px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.ink3,
    letterSpacing: '0.12em', textTransform: 'uppercase', borderTop: `1px solid ${TBL.matLine}`,
  } as CSSProperties,
  deckSelect: {
    background: 'rgba(0,0,0,0.4)', color: TBL.ink,
    border: `1px solid ${TBL.matLine2}`, borderRadius: 5,
    padding: '5px 8px', fontSize: 12, fontFamily: "'Inter', sans-serif",
    outline: 'none', width: '100%', marginTop: 4,
  } as CSSProperties,
  label: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: TBL.ink3,
    letterSpacing: '0.1em', textTransform: 'uppercase',
  } as CSSProperties,
  codeBox: { display: 'flex', gap: 6, marginTop: 4, width: '100%' } as CSSProperties,
  codeInput: {
    width: 0, flex: 1, minWidth: 0,          // flex-grow but won't overflow card
    background: 'rgba(0,0,0,0.4)', color: TBL.ink, border: `1px solid ${TBL.matLine2}`,
    padding: '7px 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: '0.3em',
    textAlign: 'center', textTransform: 'uppercase', borderRadius: 5, outline: 'none',
  } as CSSProperties,
  codeBtn: (on: boolean): CSSProperties => ({
    padding: '7px 12px', background: on ? TBL.amber : 'rgba(255,255,255,0.05)',
    color: on ? '#1a1208' : TBL.ink3, border: 'none', borderRadius: 5,
    cursor: on ? 'pointer' : 'default', fontWeight: 600, fontSize: 12.5,
    fontFamily: "'Inter', sans-serif",
  }),
  primaryBtn: {
    padding: '9px 20px', background: TBL.amber, color: '#1a1208',
    border: 'none', borderRadius: 7, cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, width: '100%', marginTop: 4,
  } as CSSProperties,
};

export function Lobby({ host, join }: LobbyProps) {
  const { startSolo, savedGame, resumeGame, clearSavedGame } = useGameStore();
  const { decks } = useDeckStore();
  const { playerName, avatarLetter, setPlayerName } = useSettingsStore();

  const [myDeckId,  setMyDeckId]  = useState(decks[0]?.id ?? '');
  const [oppDeckId, setOppDeckId] = useState(decks[1]?.id ?? decks[0]?.id ?? '');
  const [joinCode,  setJoinCode]  = useState('');
  const [hosting,   setHosting]   = useState(false);
  const [joining,   setJoining]   = useState(false);
  const [nameEdit,  setNameEdit]  = useState(false);
  const [nameVal,   setNameVal]   = useState(playerName);
  const [error,     setError]     = useState('');

  const myDeck  = decks.find(d => d.id === myDeckId)  ?? decks[0];
  const oppDeck = decks.find(d => d.id === oppDeckId) ?? decks[1] ?? decks[0];

  const myCards  = myDeck  ? deckToCards(myDeck.cards)  : [];
  const oppCards = oppDeck ? deckToCards(oppDeck.cards) : [];

  const handleSandbox = () => {
    if (!myCards.length) { setError('Select a valid deck first'); return; }
    startSolo(myCards, oppCards.length ? oppCards : myCards, playerName, 'Opponent');
  };

  const handleHost = async () => {
    if (hosting || !myCards.length) return;
    setHosting(true); setError('');
    try { await host(myCards, oppCards.length ? oppCards : myCards); }
    catch (e) { setError(`Couldn't connect: ${String(e)}`); setHosting(false); }
  };

  const handleJoin = async () => {
    if (joining || joinCode.length !== 6 || !myCards.length) return;
    setJoining(true); setError('');
    // Only our own deck is sent — the host assembles both sides (opponent dropdown is ignored).
    try { await join(joinCode, myCards); }
    catch (e) { setError(`Couldn't join: ${String(e)}`); setJoining(false); }
  };

  const saveName = () => {
    if (nameVal.trim()) setPlayerName(nameVal.trim());
    setNameEdit(false);
  };

  return (
    <div style={lb.root}>
      <div style={lb.body}>

        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TBL.amber, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>
          Encounter Lobby
        </div>
        <h1 style={{ fontFamily: "'Newsreader', serif", fontSize: 36, fontWeight: 500, color: TBL.ink, margin: '0 0 8px', letterSpacing: '-0.015em', lineHeight: 1.05, textAlign: 'center', maxWidth: 580 }}>
          Take your seat, <span style={{ fontStyle: 'italic', color: TBL.amber2 }}>summon</span> the opposite chair.
        </h1>
        <p style={{ color: TBL.ink2, fontSize: 13, lineHeight: 1.55, margin: '0 0 20px', textAlign: 'center', maxWidth: 480, fontFamily: "'Inter', sans-serif" }}>
          Choose your deck and how to play.
        </p>

        {error && (
          <div style={{ marginBottom: 12, padding: '7px 14px', background: 'rgba(224,106,106,0.12)', border: `1px solid ${TBL.danger}44`, borderRadius: 6, color: TBL.danger, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5 }}>
            {error}
          </div>
        )}

        {/* Deck selector row */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'flex-end' }}>
          <div>
            <div style={lb.label}>Your deck</div>
            <select style={lb.deckSelect} value={myDeckId} onChange={e => setMyDeckId(e.target.value)}>
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({Object.keys(d.cards).length} cards)</option>
              ))}
            </select>
          </div>
          <div style={{ color: TBL.ink4, fontFamily: "'Newsreader', serif", fontSize: 20, paddingBottom: 4 }}>vs</div>
          <div>
            <div style={lb.label}>Opponent deck (sandbox)</div>
            <select style={lb.deckSelect} value={oppDeckId} onChange={e => setOppDeckId(e.target.value)}>
              {decks.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({Object.keys(d.cards).length} cards)</option>
              ))}
            </select>
          </div>
          {myCards.length < 50 && (
            <div style={{ fontSize: 11, color: TBL.amber2, fontFamily: "'JetBrains Mono', monospace", paddingBottom: 6 }}>
              ⚠ {myCards.length}/50 cards
            </div>
          )}
        </div>

        {/* Mode cards */}
        <div style={lb.opts}>
          {/* Host */}
          <div style={lb.opt(true)}>
            <div style={lb.optGlyph(TBL.violet)}>✦</div>
            <div style={lb.optTitle}>Host a match</div>
            <div style={lb.optDesc}>Generate a 6-character code and share it with your opponent.</div>
            <button style={{ ...lb.primaryBtn, background: hosting ? 'rgba(255,255,255,0.1)' : TBL.violet, color: hosting ? TBL.ink3 : '#fff', cursor: hosting ? 'default' : 'pointer' }}
              onClick={handleHost} disabled={hosting}>
              {hosting ? 'Connecting…' : 'Host'}
            </button>
          </div>

          {/* Join */}
          <div style={lb.opt(false)}>
            <div style={lb.optGlyph(TBL.amber)}>⌖</div>
            <div style={lb.optTitle}>Join with a code</div>
            <div style={lb.optDesc}>Enter the 6-character code your host sent you.</div>
            <div style={lb.codeBox}>
              <input style={lb.codeInput} placeholder="ABC123" value={joinCode} maxLength={6}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter' && joinCode.length === 6) handleJoin(); }}
              />
              {joinCode.length > 0 && (
                <button style={lb.codeBtn(joinCode.length === 6 && !joining)} onClick={handleJoin} disabled={joining}>
                  {joining ? '…' : 'Join'}
                </button>
              )}
            </div>
          </div>

          {/* Sandbox */}
          <div style={lb.opt(false, true)} onClick={handleSandbox}>
            <div style={lb.optGlyph(TBL.good)}>◐</div>
            <div style={lb.optTitle}>Sandbox solo</div>
            <div style={lb.optDesc}>Play both sides locally — test rules, combos, and edge cases with your chosen decks.</div>
            <button style={{ ...lb.primaryBtn, background: TBL.good, color: '#0c1a10', cursor: 'pointer' }}>
              Start sandbox
            </button>
          </div>
        </div>

        {/* Resume banner */}
        {savedGame && (
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'rgba(214,160,80,0.08)', border: `1px solid ${TBL.matLine2}`, borderRadius: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TBL.amber2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              In-progress game · Turn {savedGame.turn}
            </span>
            <button onClick={resumeGame} style={{ padding: '5px 12px', background: TBL.amber, color: '#1a1208', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
              Resume
            </button>
            <button onClick={() => clearSavedGame()} style={{ padding: '5px 10px', background: 'transparent', color: TBL.ink3, border: `1px solid ${TBL.matLine}`, borderRadius: 5, cursor: 'pointer', fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
              Discard
            </button>
          </div>
        )}
      </div>

      <div style={lb.foot}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {nameEdit ? (
            <>
              <input value={nameVal} onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                style={{ background: 'rgba(0,0,0,0.4)', color: TBL.ink, border: `1px solid ${TBL.matLine2}`, borderRadius: 4, padding: '3px 7px', fontSize: 11, outline: 'none', fontFamily: "'Inter', sans-serif", width: 110 }}
                autoFocus
              />
              <span {...btnProps(saveName)} style={{ cursor: 'pointer', color: TBL.amber2 }}>✓</span>
            </>
          ) : (
            <span {...btnProps(() => { setNameEdit(true); setNameVal(playerName); })} style={{ cursor: 'pointer' }}>
              {avatarLetter} {playerName} · edit name
            </span>
          )}
        </div>
        <span>Tab cycles units · ↵ ends turn · hover a card to zoom</span>
        <span>{decks.length} saved deck{decks.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
