'use client';

import { useCallback, useEffect, useState } from 'react';

type Dashboard = { totalCount: number; eligibleCount: number; activeDraw: { id: number; eligibleCount: number } | null; participants: Array<{ id: number; fullName: string; phone: string; icNumber: string; registeredAt: string; hasWon: boolean }>; history: Array<{ id: number; fullName: string; phone: string; eligibleCount: number; completedAt: string; invalidatedAt: string | null }> };
const empty: Dashboard = { totalCount: 0, eligibleCount: 0, activeDraw: null, participants: [], history: [] };

export default function Admin() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [dashboard, setDashboard] = useState<Dashboard>(empty); const [search, setSearch] = useState(''); const [starting, setStarting] = useState(false);
  const [returningId, setReturningId] = useState<number | null>(null);
  const returnWinner = async (id: number, name: string) => {
    if (!window.confirm(`Invalidate ${name}'s win and return them to the eligible draw pool?`)) return;
    setReturningId(id);
    try {
      const response = await fetch(`/api/admin/draws/${id}/invalidate`, { method: 'POST' });
      const data = await response.json();
      setMessage(response.ok ? `${data.fullName} has been returned to the draw.` : data.error || 'Unable to return this winner.');
      await load();
    } catch { setMessage('Unable to reach the server. Please try again.'); }
    finally { setReturningId(null); }
  };
  useEffect(() => { document.body.classList.add('portal-body'); return () => document.body.classList.remove('portal-body'); }, []);
  const load = useCallback(async () => { const response = await fetch(`/api/admin/dashboard?search=${encodeURIComponent(search)}`, { cache: 'no-store' }); if (response.status === 401) { setAuthenticated(false); return; } if (response.ok) { setDashboard(await response.json()); setAuthenticated(true); } }, [search]);
  useEffect(() => { void fetch('/api/admin/me').then(r => r.json()).then(data => setAuthenticated(data.authenticated)).catch(() => setAuthenticated(false)); }, []);
  useEffect(() => { if (!authenticated) return; const timeout = window.setTimeout(() => void load(), 200); const interval = window.setInterval(() => void load(), 1000); return () => { window.clearTimeout(timeout); window.clearInterval(interval); }; }, [authenticated, load]);
  const login = async (event: React.FormEvent) => { event.preventDefault(); setMessage(''); const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); const data = await response.json(); if (!response.ok) { setMessage(data.error || 'Unable to sign in.'); return; } setPassword(''); setAuthenticated(true); };
  const start = async () => { setStarting(true); setMessage(''); const response = await fetch('/api/admin/draw/start', { method: 'POST' }); const data = await response.json(); if (!response.ok) setMessage(data.error || 'Unable to start the draw.'); else { setMessage(`Draw #${data.activeDraw.id} is live on the stage.`); await load(); } setStarting(false); };
  const logout = async () => { await fetch('/api/admin/logout', { method: 'POST' }); setAuthenticated(false); setDashboard(empty); };
  if (authenticated === null) return <main className="portal admin-page"><p className="loading">LOADING CONTROL ROOM…</p></main>;
  if (!authenticated) return <main className="portal admin-page"><section className="login-card"><p className="portal-kicker">EVENT CONTROL</p><h1>Admin sign in</h1><form onSubmit={login}><label>SHARED EVENT PASSWORD<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus /></label>{message && <p className="form-error">{message}</p>}<button className="portal-button">SIGN IN</button></form></section></main>;
  return <main className="portal admin-page">
    <header className="admin-header"><div><p className="portal-kicker">EVENT CONTROL</p><h1>Lucky Draw</h1></div><div className="admin-actions"><a className="stage-link" href="/draw" target="_blank" rel="noreferrer">OPEN STAGE ↗</a><button className="text-button" onClick={logout}>SIGN OUT</button></div></header>
    <section className="metrics"><article><small>REGISTERED</small><strong>{dashboard.totalCount}</strong></article><article><small>ELIGIBLE NOW</small><strong>{dashboard.eligibleCount}</strong></article><article><small>DRAW STATUS</small><strong>{dashboard.activeDraw ? 'LIVE' : 'READY'}</strong></article></section>
    <section className="admin-draw"><div><p className="portal-kicker">NEXT WINNER</p><h2>{dashboard.activeDraw ? `Draw #${dashboard.activeDraw.id} is in progress` : dashboard.eligibleCount ? `${dashboard.eligibleCount} ducks are ready` : 'Waiting for registrations'}</h2>{message && <p className="admin-message" role="status">{message}</p>}</div><button className="portal-button" onClick={start} disabled={starting || Boolean(dashboard.activeDraw) || dashboard.eligibleCount === 0}>{starting ? 'STARTING…' : dashboard.activeDraw ? 'DRAW IN PROGRESS' : 'START DRAW'}</button></section>
    <section className="admin-grid">
      <section className="data-card"><div className="data-title"><h2>Participants</h2><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or IC" /></div><div className="table-wrap"><table><thead><tr><th>NAME</th><th>PHONE</th><th>IC</th><th>STATUS</th></tr></thead><tbody>{dashboard.participants.map(person => <tr key={person.id}><td>{person.fullName}</td><td>{person.phone}</td><td>{person.icNumber}</td><td>{person.hasWon ? 'WINNER' : 'ELIGIBLE'}</td></tr>)}{!dashboard.participants.length && <tr><td colSpan={4}>No participants yet.</td></tr>}</tbody></table></div></section>
      <section className="data-card history-card"><h2>Previous winners</h2>{dashboard.history.length ? <ol>{dashboard.history.map(draw => <li key={draw.id}>
        <strong>{draw.fullName}</strong><span>{draw.phone} · Draw #{draw.id} · {draw.eligibleCount} eligible</span>
        {draw.invalidatedAt ? <span className="returned-winner">INVALIDATED · RETURNED TO DRAW</span> : <button className="return-winner" disabled={returningId !== null} onClick={() => void returnWinner(draw.id, draw.fullName)}>{returningId === draw.id ? 'RETURNING…' : 'INVALIDATE & RETURN TO DRAW'}</button>}
      </li>)}</ol> : <p className="empty-history">No winners yet.</p>}</section>
    </section>
  </main>;
}
