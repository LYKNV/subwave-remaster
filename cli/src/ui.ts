// Shared UI helpers for the SUB/WAVE operator CLI.
//
// Wraps @clack/prompts + picocolors so commands share a consistent voice and
// can opt into "menu mode" — where Esc inside a prompt throws MENU_BACK
// instead of cancelling the whole process. The main menu loop catches
// MENU_BACK and re-renders, giving the operator a snappy back-out feel.
// Pattern lifted from locca's src/ui.ts.

import * as p from '@clack/prompts';
import pc from 'picocolors';
import readline from 'node:readline';

export { p, pc };

export const MENU_BACK = Symbol('menu-back');

let menuMode = false;
let rlInstalled = false;

// Translate Esc → Ctrl-C only while menu mode is on. Clack treats Ctrl-C as
// a cancel sentinel, which the menu loop interprets as "back to the
// previous screen". When menu mode is off (e.g. during `subwave setup`),
// Esc has no special meaning and the prompts work as Clack ships them.
function installEscHandler(): void {
  if (rlInstalled) return;
  rlInstalled = true;
  if (!process.stdin.isTTY) return;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', (_str: string, key: readline.Key) => {
    if (menuMode && key && key.name === 'escape') {
      // Emit a synthetic Ctrl-C; Clack's keypress handler treats it as cancel.
      process.stdin.emit('keypress', '\x03', { ctrl: true, name: 'c' });
    }
  });
}

export function setMenuMode(on: boolean): void {
  menuMode = on;
  if (on) installEscHandler();
}

export function isMenuMode(): boolean {
  return menuMode;
}

// Unwrap a Clack prompt result. If the operator cancelled (Esc or Ctrl-C)
// and we're inside the menu loop, throw MENU_BACK so the loop can redraw;
// otherwise treat it as an exit.
export function exitIfCancelled<T>(value: T | symbol, opts: { backOnCancel?: boolean } = {}): T {
  const { backOnCancel = true } = opts;
  if (p.isCancel(value)) {
    if (backOnCancel && menuMode) throw MENU_BACK;
    p.cancel('Cancelled.');
    process.exit(1);
  }
  return value as T;
}

export function banner(tagline?: string): void {
  const lines = [
    pc.cyan(pc.bold('  ███████╗██╗   ██╗██████╗     ██╗    ██╗ █████╗ ██╗   ██╗███████╗')),
    pc.cyan(pc.bold('  ██╔════╝██║   ██║██╔══██╗   ██╔╝    ██║██╔══██╗██║   ██║██╔════╝')),
    pc.cyan(pc.bold('  ███████╗██║   ██║██████╔╝  ██╔╝     ██║███████║██║   ██║█████╗  ')),
    pc.cyan(pc.bold('  ╚════██║██║   ██║██╔══██╗ ██╔╝ ██   ██║██╔══██║╚██╗ ██╔╝██╔══╝  ')),
    pc.cyan(pc.bold('  ███████║╚██████╔╝██████╔╝██╔╝  ╚█████╔╝██║  ██║ ╚████╔╝ ███████╗')),
    pc.cyan(pc.bold('  ╚══════╝ ╚═════╝ ╚═════╝ ╚═╝    ╚════╝ ╚═╝  ╚═╝  ╚═══╝  ╚══════╝')),
  ];
  console.log();
  for (const line of lines) console.log(line);
  if (tagline) console.log('  ' + pc.dim(tagline));
  console.log();
}

export function header(text: string): void {
  const padLen = Math.max(0, 60 - text.length);
  console.log();
  console.log(pc.bold(pc.cyan('━━ ' + text + ' ' + '━'.repeat(padLen))));
}

export function section(text: string): void {
  console.log();
  console.log(pc.bold(text));
}

// Status badges. Used by status/doctor renderers. The unicode glyphs match
// what locca uses so existing operator muscle memory transfers.
export function ok(msg: string): void { console.log(`  ${pc.green('●')} ${msg}`); }
export function warn(msg: string): void { console.log(`  ${pc.yellow('⚠')} ${msg}`); }
export function err(msg: string): void { console.log(`  ${pc.red('✗')} ${msg}`); }
export function info(msg: string): void { console.log(`  ${pc.cyan('·')} ${msg}`); }
export function muted(msg: string): void { console.log(`  ${pc.dim(msg)}`); }

// Small helper so commands can pause and let the operator read output
// before the menu loop redraws. No-op when not in menu mode (one-shot
// command invocations should just return).
export async function pauseForEnter(): Promise<void> {
  if (!menuMode) return;
  await p.text({
    message: pc.dim('Press Enter to return to the menu…'),
    defaultValue: '',
    placeholder: '',
  });
}
