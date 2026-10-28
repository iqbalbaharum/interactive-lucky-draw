'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicStatus } from '../lib/types';

const empty: PublicStatus = { totalCount: 0, eligibleCount: 0, eligibleNames: [], activeDraw: null };

export default function Control() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<PublicStatus>(empty);
  const [busy, setBusy] = useState<'start' | 'hit' | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => { document.body.classList.add('control-body'); return () => document.body.classList.remove('control-body'); }, []);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (response.ok) setStatus(await response.json());
    } catch { setMessage('Connection lost. Reconnecting…'); }
  }, []);
  useEffect(() => {
    void fetch('/api/admin/me').then(response => response.json()).then(data => setAuthenticated(Boolean(data.authenticated))).catch(() => setAuthenticated(false));
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    void refresh();
    const timer = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 500);
    return () => window.clearInterval(timer);
  }, [authenticated, refresh]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || 'Unable to sign in.'); return; }
      setPassword(''); setAuthenticated(true);
    } catch { setMessage('Connection lost. Please try again.'); }
  };
  const action = async (type: 'start' | 'hit') => {
    if (busy) return;
    setBusy(type); setMessage('');
    try {
      const response = await fetch(`/api/admin/draw/${type}`, { method: 'POST' });
      const data = await response.json();
      if (response.status === 401) { setAuthenticated(false); setMessage('Session expired. Sign in again.'); return; }
      if (!response.ok) { setMessage(data.error || `Could not ${type} the draw.`); return; }
      setStatus(previous => ({ ...previous, activeDraw: data.activeDraw }));
      await refresh();
    } catch { setMessage('Connection lost. Please try again.'); }
    finally { setBusy(null); }
  };

  if (authenticated === null) return <main className="control-screen control-loading">LOADING CONTROLS…</main>;
  if (!authenticated) return <main className="control-screen control-login"><section className="control-login-card"><p>EVENT CONTROL</p><h1>Sign in</h1><form onSubmit={login}><label htmlFor="control-password">Shared event password</label><input id="control-password" autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} required />{message && <p role="alert" className="control-error">{message}</p>}<button type="submit">SIGN IN</button></form></section></main>;

  const active = status.activeDraw;
  const readyToHit = active?.status === 'flocking' && now - new Date(active.startedAt).getTime() >= 2100;
  const startingNextRound = active?.status === 'reserved';
  const startDisabled = Boolean(busy || active?.status === 'flocking' || status.eligibleCount === 0);
  const hitDisabled = Boolean(busy || !readyToHit);
  const stateLabel = active?.status === 'flocking' ? `DRAW #${active.id} · DUCKS FLYING` : active?.status === 'reserved' ? `DRAW #${active.id} · WINNER ON STAGE` : `${status.eligibleCount} ELIGIBLE DUCKS`;
  return <main className="control-screen">
    <div className="control-top"><a href="/admin">← ADMIN</a><span role="status" aria-live="polite">{stateLabel}</span><a href="/draw" target="_blank" rel="noreferrer">STAGE ↗</a></div>
    {message && <p className="control-banner" role="alert">{message}</p>}
    <div className="control-actions">
      <button className="control-action control-start" disabled={startDisabled} onClick={() => void action('start')}><span className="control-icon" aria-hidden="true">▶</span><strong>{startingNextRound ? 'START NEXT ROUND' : 'START'}</strong><small>{busy === 'start' ? 'STARTING…' : startingNextRound ? 'RECORD WINNER & SEND DUCKS FLYING' : active ? 'DRAW IN PROGRESS' : status.eligibleCount ? 'SEND DUCKS FLYING' : 'WAITING FOR PARTICIPANTS'}</small></button>
      <button className="control-action control-hit" disabled={hitDisabled} onClick={() => void action('hit')}><span className="control-icon" aria-hidden="true">✦</span><strong>HIT</strong><small>{busy === 'hit' ? 'SELECTING WINNER…' : readyToHit ? 'SHOOT & SELECT WINNER' : active?.status === 'flocking' ? 'DOG IS SNIFFING…' : active ? 'WINNER ON STAGE' : 'PRESS START FIRST'}</small></button>
    </div>
  </main>;
}
