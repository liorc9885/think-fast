'use client';

import { useEffect, useState, useCallback } from 'react';

type Entry = {
  rank: number;
  displayName: string;
  score: number;
  coins: number;
  skins: number;
};

function getPlayerId(): string {
  let id = localStorage.getItem('thinkFastPlayerId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('thinkFastPlayerId', id);
  }
  return id;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [myName, setMyName] = useState('');
  const [myCoins, setMyCoins] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [toName, setToName] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch('/api/v1/leaderboard?limit=30');
    const data = await res.json();
    setEntries(data.entries || []);
  }, []);

  const loadMe = useCallback(async () => {
    const res = await fetch('/api/v1/progress', {
      headers: { 'X-Player-Id': getPlayerId() },
    });
    const data = await res.json();
    setMyName(data.progress?.displayName || '');
    setNameInput(data.progress?.displayName || '');
    setMyCoins(data.progress?.coins ?? null);
  }, []);

  useEffect(() => {
    loadLeaderboard();
    loadMe();
  }, [loadLeaderboard, loadMe]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch('/api/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Player-Id': getPlayerId() },
        body: JSON.stringify({ displayName: nameInput.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'שגיאה בשמירת השם');
        return;
      }
      setMyName(data.displayName || '');
      setMyCoins(data.coins);
      setStatus('השם נשמר!');
      await loadLeaderboard();
    } finally {
      setLoading(false);
    }
  }

  async function sendCoins(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const amt = parseInt(amount, 10);
    if (!toName.trim() || !amt || amt <= 0) {
      setStatus('נא למלא שם מקבל וסכום תקין');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Player-Id': getPlayerId() },
        body: JSON.stringify({ toDisplayName: toName.trim(), amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'שגיאה בהעברת המטבעות');
        return;
      }
      setMyCoins(data.coins);
      setStatus(`הועברו ${amt} מטבעות ל-${toName.trim()}`);
      setToName('');
      setAmount('');
      await loadLeaderboard();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{ fontFamily: 'system-ui, sans-serif', padding: 32, maxWidth: 640, margin: '0 auto' }}
    >
      <h1>טופ השחקנים</h1>

      <section style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>שם התצוגה שלי</h2>
        {myCoins !== null && (
          <p>
            שם נוכחי: <strong>{myName || '(אין שם)'}</strong> · מטבעות: <strong>{myCoins}</strong>
          </p>
        )}
        <form onSubmit={saveName} style={{ display: 'flex', gap: 8 }}>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="הקלד/י שם"
            maxLength={64}
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" disabled={loading}>
            שמור/שנה שם
          </button>
        </form>
      </section>

      <section style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>העברת מטבעות</h2>
        <form onSubmit={sendCoins} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            placeholder="שם השחקן המקבל"
            maxLength={64}
            style={{ flex: 1, padding: 8, minWidth: 160 }}
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="כמות מטבעות"
            type="number"
            min={1}
            style={{ width: 140, padding: 8 }}
          />
          <button type="submit" disabled={loading}>
            העבר
          </button>
        </form>
      </section>

      {status && <p>{status}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cellStyle}>#</th>
            <th style={cellStyle}>שם</th>
            <th style={cellStyle}>ניקוד</th>
            <th style={cellStyle}>סקינים</th>
            <th style={cellStyle}>מטבעות</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.rank}>
              <td style={cellStyle}>{e.rank}</td>
              <td style={cellStyle}>{e.displayName}</td>
              <td style={cellStyle}>{e.score}</td>
              <td style={cellStyle}>{e.skins}</td>
              <td style={cellStyle}>{e.coins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '6px 10px',
  textAlign: 'right',
};
