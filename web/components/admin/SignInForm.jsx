'use client';

import { useState } from 'react';

export default function SignInForm({ onSubmit }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!user || !pass || busy) return;
    setBusy(true);
    setErr(null);
    const res = await onSubmit(user, pass);
    // On success the gate swaps this form out; only handle failure here.
    if (res && !res.ok) {
      setErr(res.error || 'sign-in failed');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ border: '1px solid var(--ink)', maxWidth: 420, margin: '0 auto' }}>
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--ink)' }}>
        <span className="v3-eyebrow" style={{ fontSize: 11 }}>Admin sign-in</span>
      </div>
      <div className="p-5 space-y-3">
        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
          The controller requires admin credentials for the admin panel.
          They&apos;re cached in this browser only.
        </div>
        <input
          type="text"
          autoComplete="username"
          placeholder="username"
          value={user}
          onChange={e => setUser(e.target.value)}
          className="w-full v3-focus"
          style={inputStyle}
          autoFocus
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="password"
          value={pass}
          onChange={e => setPass(e.target.value)}
          className="w-full v3-focus"
          style={inputStyle}
        />
        {err && (
          <div style={{ color: '#c5302a', fontSize: 12, lineHeight: 1.5 }}>{err}</div>
        )}
        <button
          type="submit"
          disabled={!user || !pass || busy}
          className="v3-eyebrow v3-focus cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            fontSize: 10,
          }}
        >
          {busy ? 'signing in…' : 'sign in'}
        </button>
      </div>
    </form>
  );
}

const inputStyle = {
  boxSizing: 'border-box',
  border: '1px solid var(--ink)',
  background: 'transparent',
  padding: 10,
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--ink)',
};
