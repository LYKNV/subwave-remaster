'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { Radio, Disc3, CalendarClock, Drama, Sparkles, SlidersHorizontal, Terminal } from 'lucide-react';
import { useAdminAuth } from '../../lib/adminAuth';
import { useStationFeed } from '../../hooks/useStationFeed';
import SignInForm from './SignInForm';
import ThemeToggle from './ThemeToggle';
import { Toaster } from '../ui/toaster';

// Nav is grouped: what's happening now → what the station plays → the box itself.
const NAV_SECTIONS = [
  {
    label: 'Monitor',
    items: [
      { href: '/admin/dash', id: 'dash', label: 'Dash', icon: Radio, pill: 'live' },
    ],
  },
  {
    label: 'Programming',
    items: [
      { href: '/admin/library',  id: 'library',  label: 'Library',  icon: Disc3 },
      { href: '/admin/shows',    id: 'shows',    label: 'Shows',    icon: CalendarClock },
      { href: '/admin/personas', id: 'personas', label: 'Personas', icon: Drama },
      { href: '/admin/skills',   id: 'skills',   label: 'Skills',   icon: Sparkles },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/settings', id: 'settings', label: 'Settings', icon: SlidersHorizontal },
      { href: '/admin/debug',    id: 'debug',    label: 'Debug',    icon: Terminal },
    ],
  },
];

const NAV = NAV_SECTIONS.flatMap(s => s.items);

// Wraps every page under /admin. Renders the newsprint shell + sign-in gate.
// Children are admin panels that re-call useAdminAuth themselves to avoid
// prop-drilling the adminFetch.
export default function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { auth, needsAuth, hydrated, signIn, signOut, adminFetch } = useAdminAuth();

  const handleSignIn = useCallback(async (user, pass) => {
    const res = await signIn(user, pass);
    if (res?.ok && pathname !== '/admin/dash') router.push('/admin/dash');
    return res;
  }, [signIn, pathname, router]);

  // Probe an admin endpoint on first paint so a revoked token surfaces the
  // sign-in form proactively.
  useEffect(() => {
    if (!hydrated || !auth) return;
    let cancelled = false;
    (async () => {
      try { await adminFetch('/settings'); } catch {}
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, auth]);

  if (!hydrated) {
    return (
      <div className="admin-root paper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="caption">loading…</span>
      </div>
    );
  }

  // Authentication gate — covers both "no token yet" and "token rejected".
  if (!auth || needsAuth) {
    return (
      <div className="admin-root paper">
        <ShellHeader pathname={pathname} signedIn={false} />
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '48px 28px' }}>
          <SignInForm onSubmit={handleSignIn} />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-root paper">
      <ShellHeader pathname={pathname} signedIn onSignOut={signOut} />
      <div className="shell-body">
        <nav className="shell-nav">
          {NAV_SECTIONS.map(section => (
            <div key={section.label} className="nav-section">
              <span className="nav-section-label">{section.label}</span>
              {section.items.map(n => {
                const active = pathname?.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <Link key={n.id} href={n.href} className={`nav-item ${active ? 'active' : ''}`}>
                    <Icon className="nav-icon" size={15} strokeWidth={2} aria-hidden="true" />
                    <span className="nav-label">{n.label}</span>
                    {n.pill && <span className="pill">{n.pill}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="nav-foot">
            sub / wave<br />
            admin console<br />
            newsprint v3
          </div>
        </nav>
        <main style={{ minWidth: 0 }}>{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

// Header — wordmark, breadcrumb, and (when signed in) the live station strip.
function ShellHeader({ pathname, signedIn, onSignOut }) {
  const current = NAV.find(n => pathname?.startsWith(n.href))?.label || 'Admin';
  const { nowPlaying, listeners } = useStationFeed();
  const onAir = !!nowPlaying?.title;
  const count = listeners?.current ?? listeners?.count ?? (typeof listeners === 'number' ? listeners : null);

  return (
    <header className="shell-header">
      <span className="wordmark">SUB / WAVE</span>
      <span className="caption" style={{ color: 'var(--muted)' }}>· admin</span>
      <span className="crumb">/ <b>{current}</b></span>
      {signedIn && (
        <span className="right">
          <span className="live-dot" style={{ background: onAir ? 'var(--accent)' : 'var(--muted)' }} />
          <span>{onAir ? 'on air' : 'off air'}</span>
          {count != null && (
            <>
              <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--separator-strong)' }} />
              <span>{count} listening</span>
            </>
          )}
          <Link href="/" className="caption" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            ← player
          </Link>
          <ThemeToggle />
          {onSignOut && (
            <button className="sign-out" onClick={onSignOut}>sign out</button>
          )}
        </span>
      )}
      {!signedIn && (
        <span className="right">
          <Link href="/" className="caption" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
            ← player
          </Link>
          <ThemeToggle />
        </span>
      )}
    </header>
  );
}
