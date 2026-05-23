import { toast } from 'sonner';

// Thin wrapper around Sonner so every transient notification across the app
// goes through the same call site.
//
// When to use what:
//
// - **notify.ok** — a one-shot action succeeded (saved, jingle generated,
//   skill fired, stream started). Default duration; auto-dismisses.
// - **notify.err** — a one-shot action failed (save error, network blip on
//   a mutation, run failed). Longer duration so the operator notices.
// - **notify.info** — neutral acknowledgement (queued, copied, etc.).
// - **notify.busy** — a long-running op is in flight ("mixer restarting…",
//   "tagger running…"). Stays up until the caller dismisses it with the
//   returned id; pair with notify.dismiss(id) on completion.
// - **notify.dismiss** — clear a busy toast (or any specific toast id).
//
// What this is NOT for:
//
// - Persistent panel-level "controller is offline" / "data couldn't load"
//   states. Those should stay as inline V3Alert cards so the operator
//   still sees them after the toast would have auto-dismissed.
// - Field-level validation errors. Those belong inline next to the field.

export const notify = {
  ok: (message: string) => toast.success(message),
  err: (message: string) => toast.error(message, { duration: 6000 }),
  info: (message: string) => toast(message),
  busy: (message: string): string | number =>
    toast.loading(message, { duration: Infinity }),
  dismiss: (id: string | number) => toast.dismiss(id),
};

// Pull a human-readable message out of an unknown caught value.
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
