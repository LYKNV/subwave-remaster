'use client';

import { useEffect, useRef } from 'react';

const TEXT_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTextEntry(el) {
  if (!el) return false;
  if (TEXT_INPUT_TAGS.has(el.tagName)) return true;
  return el.isContentEditable === true;
}

// Registers global keydown shortcuts on window. `handlers` maps a normalised
// key string ('space', 'arrowup', 't', '?', 'mod+k', …) to a callback.
//
// Bare-key shortcuts are suppressed while the user is typing in a field or
// while `disabled` is true; the command-palette chord (Cmd/Ctrl+K) always
// fires so the palette can be opened — and toggled shut — from anywhere.
//
// Handlers/disabled are read through refs so the window listener binds once
// and survives PlayerApp's per-second re-renders.
export function useKeyboardShortcuts(handlers, { disabled = false } = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    function onKeyDown(e) {
      const mod = e.metaKey || e.ctrlKey;

      // Command palette chord — available even inside text fields.
      if (mod && e.key.toLowerCase() === 'k') {
        const run = handlersRef.current['mod+k'];
        if (run) {
          e.preventDefault();
          run(e);
        }
        return;
      }

      // Leave every other modifier combo to the browser (copy/paste/etc).
      if (mod || e.altKey) return;

      // Bare keys: never while typing, or while a palette/dialog owns input.
      if (disabledRef.current || isTextEntry(e.target)) return;

      const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
      const run = handlersRef.current[key];
      if (!run) return;
      e.preventDefault();
      run(e);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
