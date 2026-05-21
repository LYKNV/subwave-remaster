import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  ...tseslint.configs.recommended,
  globalIgnores(['node_modules/**']),

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { react: reactPlugin, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Automatic JSX runtime (jsx: react-jsx).
      'react/react-in-jsx-scope': 'off',
      // TypeScript replaces prop-types.
      'react/prop-types': 'off',
      // JSX renders apostrophes/quotes fine.
      'react/no-unescaped-entities': 'off',
    },
  },

  {
    rules: {
      // tui is a small surface (~18 files), so any sites can be cleaned up
      // in one pass — no warning channel needed.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);
