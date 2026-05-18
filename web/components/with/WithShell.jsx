import Masthead from '../landing/Masthead';
import StationFooter from '../landing/StationFooter';
import WithNav from './WithNav';

// Shared chrome for every /with/* page: the broadsheet masthead, a sticky
// sidebar table of contents, the page body, and the station footer. Wired up
// once in app/with/layout.js so each page component is just its content.
// Reuses the manual section's layout classes — same docs-sidebar shape.
export default function WithShell({ children }) {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)', minHeight: '100vh' }}>
      <Masthead />

      <main className="bs-paper">
        <div className="bs-manual-layout">
          <WithNav />
          <div className="bs-manual-content">{children}</div>
        </div>
        <StationFooter />
      </main>
    </div>
  );
}
