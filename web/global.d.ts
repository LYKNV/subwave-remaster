// Ambient module declarations for side-effect-only asset imports. Next.js
// handles these at the bundler level; the declarations here only exist so
// strict `tsc --noEmit` accepts `import './globals.css'` without TS2882.
declare module '*.css';
