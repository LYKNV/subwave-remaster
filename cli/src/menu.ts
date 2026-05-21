// Main menu loop. Status-aware — the top-level actions adapt to what's
// currently running (start vs stop vs restart). Esc inside any submenu
// throws MENU_BACK, which is caught here and treated as "re-render".
//
// Mirrors locca's src/menu.ts pattern.

import { detectCompose } from './compose.ts';
import { setMenuMode, MENU_BACK, banner, header, ok, warn, muted, exitIfCancelled, p, pc } from './ui.ts';
import { runStatusCommand } from './commands/status.ts';
import { runDoctorCommand } from './commands/doctor.ts';
import { runStartCommand } from './commands/start.ts';
import { runStopCommand } from './commands/stop.ts';
import { runRestartCommand } from './commands/restart.ts';
import { runLogsCommand } from './commands/logs.ts';
import { runSetupCommand } from './commands/setup.ts';

export async function runMenu(): Promise<void> {
  setMenuMode(true);
  banner('operator console');

  // Header line — one quick render before the main select. Hits docker
  // ps only; no controller HTTP call so the menu pops up instantly even
  // when the stack is unreachable.
  const compose = detectCompose();
  if (compose.env === 'down') {
    warn('stack down');
  } else {
    const running = Object.values(compose.services).filter((s) => s === 'running').length;
    const total = Object.keys(compose.services).length;
    ok(`stack up · env=${pc.bold(compose.env)} · ${running}/${total} running`);
  }
  console.log();

  // Top-level menu. Build options based on stack state so the operator
  // only sees what makes sense right now (locca pattern).
  const options: Array<{ value: string; label: string; hint?: string }> = [];

  options.push({ value: 'status', label: 'status', hint: 'compose + now-playing + recent events' });
  options.push({ value: 'doctor', label: 'doctor', hint: 'full diagnostic sweep' });

  if (compose.env === 'down') {
    options.push({ value: 'start', label: 'start', hint: 'docker compose up -d' });
  } else {
    options.push({ value: 'restart', label: 'restart', hint: 'rebuild / restart a single service' });
    options.push({ value: 'logs', label: 'logs', hint: 'tail docker compose logs' });
    options.push({ value: 'stop', label: 'stop', hint: 'docker compose down' });
  }
  options.push({ value: 'setup', label: 'setup', hint: 're-run the install wizard' });
  options.push({ value: 'quit', label: pc.dim('quit') });

  let choice: string;
  try {
    choice = exitIfCancelled(await p.select({
      message: 'What do you want to do?',
      options,
    }), { backOnCancel: false });
  } catch (e) {
    if (e === MENU_BACK) return runMenu();
    throw e;
  }

  if (choice === 'quit') {
    setMenuMode(false);
    console.log();
    muted('goodbye.');
    return;
  }

  try {
    await dispatch(choice);
  } catch (e) {
    if (e !== MENU_BACK) throw e;
    // Esc inside a command — just loop back.
  }
  console.log();
  return runMenu();
}

async function dispatch(choice: string): Promise<void> {
  switch (choice) {
    case 'status':  return runStatusCommand();
    case 'doctor':  return runDoctorCommand();
    case 'start':   return runStartCommand();
    case 'stop':    return runStopCommand();
    case 'restart': return runRestartCommand();
    case 'logs':    return runLogsCommand();
    case 'setup': {
      // The setup wizard owns its own Clack lifecycle. Temporarily disable
      // menu-mode so its Esc handling works normally; restore after.
      setMenuMode(false);
      try { await runSetupCommand(); }
      finally { setMenuMode(true); }
      return;
    }
    default:
      header('Unknown choice');
      muted(`'${choice}' is not a known command.`);
      return;
  }
}
