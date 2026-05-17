import Masthead from '../landing/Masthead';
import StationFooter from '../landing/StationFooter';
import ManualNav from './ManualNav';

// Shared chrome for every /manual/* page: the broadsheet masthead, a sticky
// sidebar table of contents, the page body, and the station footer. Wired up
// once in app/manual/layout.js so each page component is just its content.
export default function ManualShell({ children }) {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' }}>
      <Masthead />

      <main className="bs-paper">
        <div className="bs-manual-layout">
          <ManualNav />
          <div className="bs-manual-content">{children}</div>
        </div>
        <StationFooter />
      </main>
    </div>
  );
}
