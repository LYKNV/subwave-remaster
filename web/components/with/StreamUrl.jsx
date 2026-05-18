'use client';

import { useEffect, useState } from 'react';
import CodeBlock from '../setup/CodeBlock';

// Renders the station's own stream URL in a copyable code block. The URL is
// resolved from the live browser origin after mount, so the guide always
// shows the address of whatever host it is being read on. `prefix` lets a
// page front it with a command (e.g. "cliamp "). The pre-mount placeholder
// matches the server render, so there is no hydration mismatch.
export default function StreamUrl({ prefix = '' }) {
  const [url, setUrl] = useState('https://your-station.example/stream.mp3');

  useEffect(() => {
    setUrl(`${window.location.origin}/stream.mp3`);
  }, []);

  return <CodeBlock>{`${prefix}${url}`}</CodeBlock>;
}
