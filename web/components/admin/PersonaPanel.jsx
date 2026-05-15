'use client';

// DJ persona editor — /admin/persona. Name, talk frequency, the rotating
// souls list, and the advanced system-prompt template. All of it POSTs to
// /settings under the `dj` key and applies live — no mixer restart.
import { useEffect, useState } from 'react';
import { useAdminAuth } from '../../lib/adminAuth';

const FREQUENCIES = ['quiet', 'moderate', 'aggressive'];
const FREQUENCY_HINTS = {
  quiet:      'Quiet — talks every 8-20 tracks · station ID once an hour · weather hourly on change.',
  moderate:   'Moderate — talks every 1-9 tracks · station IDs at :15 and :45 · weather every 30 min on change.',
  aggressive: 'Aggressive — talks every 1-3 tracks · station IDs four times an hour · weather every 15 min on change.',
};

export default function PersonaPanel() {
  const { adminFetch, needsAuth, hydrated } = useAdminAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const load = async () => {
    try {
      const r = await adminFetch('/settings');
      if (!r.ok) return null;
      const j = await r.json();
      setData(j); setErr(null);
      return j;
    } catch (e) { setErr(e.message); return null; }
  };

  // Fetch once on mount — the persona form has no live data to poll, and a
  // poll would risk clobbering unsaved edits.
  useEffect(() => {
    if (!hydrated || needsAuth) return;
    (async () => {
      const j = await load();
      if (j?.values?.dj) {
        setForm({
          name: j.values.dj.name ?? '',
          soulsText: Array.isArray(j.values.dj.souls)
            ? j.values.dj.souls.join('\n')
            : (j.values.dj.soul ?? ''),
          systemPrompt: j.values.dj.systemPrompt ?? '',
          frequency: j.values.dj.frequency ?? 'moderate',
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, needsAuth]);

  const save = async () => {
    if (!form) return;
    setBusy(true); setSaveMsg(null);
    try {
      const r = await adminFetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dj: {
            name: form.name.trim(),
            souls: form.soulsText.split('\n').map(l => l.trim()).filter(Boolean),
            systemPrompt: form.systemPrompt.trim(),
            frequency: form.frequency,
          },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `failed (${r.status})`);
      setSaveMsg({ tone: 'ok', text: 'saved' });
      await load();
    } catch (e) {
      setSaveMsg({ tone: 'err', text: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-7">
      {err && <Alert tone="err">controller error: {err}</Alert>}
      {!form && !err && <div style={{ color: 'var(--muted)' }} className="italic">loading…</div>}

      {form && (
        <Section title="DJ persona">
          <FormRow
            label="Name"
            hint="Shown in the TopBar and referenced by the LLM as the DJ's on-air name."
          >
            <TextInput
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              maxLength={40}
              style={{ width: 240 }}
            />
          </FormRow>

          <FormRow
            label="Talk frequency"
            hint="How often the DJ speaks between tracks and at the top of each hour. Music selection is unaffected."
          >
            <FrequencySegmented
              value={form.frequency}
              onChange={v => setForm(f => ({ ...f, frequency: v }))}
            />
          </FormRow>
          <Footnote>{FREQUENCY_HINTS[form.frequency]}</Footnote>

          <FormRow
            label="Souls"
            hint="One short personality per line. The DJ picks one at random per spoken line, so adding 3-6 distinct souls makes back-to-back segments feel different. Each line is injected into the system prompt as {soul}."
          >
            <textarea
              rows={8}
              value={form.soulsText}
              onChange={e => setForm(f => ({ ...f, soulsText: e.target.value }))}
              className="w-full v3-focus"
              style={{
                boxSizing: 'border-box',
                border: '1px solid var(--ink)',
                background: 'transparent',
                padding: 10,
                fontSize: 13,
                fontFamily: 'inherit',
                color: 'var(--ink)',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </FormRow>
          <div className="flex items-center gap-2 mt-1">
            <OutlineButton
              onClick={() => setForm(f => ({
                ...f,
                soulsText: Array.isArray(data?.defaults?.dj?.souls)
                  ? data.defaults.dj.souls.join('\n')
                  : f.soulsText,
              }))}
              disabled={busy || !Array.isArray(data?.defaults?.dj?.souls)}
            >
              reset to defaults
            </OutlineButton>
            <Footnote>
              {form.soulsText.split('\n').filter(l => l.trim()).length} souls · max 10 lines, 400 chars each
            </Footnote>
          </div>

          <details className="mt-3" style={{ border: '1px solid var(--ink)' }}>
            <summary
              className="cursor-pointer v3-caption"
              style={{ padding: '8px 12px', color: 'var(--ink)' }}
            >
              System prompt template (advanced)
            </summary>
            <div style={{ padding: 12, borderTop: '1px solid var(--ink)' }}>
              <Hint>
                Placeholders: <code>{'{name}'}</code> · <code>{'{soul}'}</code> ·
                {' '}<code>{'{station}'}</code> · <code>{'{location}'}</code>.
                {' '}<code>{'{name}'}</code> is required.
              </Hint>
              <textarea
                rows={10}
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                maxLength={4000}
                className="w-full v3-focus mt-2"
                style={{
                  boxSizing: 'border-box',
                  border: '1px solid var(--ink)',
                  background: 'transparent',
                  padding: 10,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'var(--ink)',
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <OutlineButton
                  onClick={() => setForm(f => ({
                    ...f,
                    systemPrompt: data?.defaults?.dj?.systemPrompt || '',
                  }))}
                  disabled={busy || !data?.defaults?.dj?.systemPrompt}
                >
                  reset to default
                </OutlineButton>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {form.systemPrompt.length}/4000 chars
                </span>
              </div>
            </div>
          </details>

          <div
            className="flex flex-wrap items-center gap-3 pt-3 mt-3"
            style={{ borderTop: '1px solid var(--separator-strong)' }}
          >
            <SolidButton onClick={save} disabled={busy}>
              save persona
            </SolidButton>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.tone === 'err' ? '#c5302a' : 'var(--accent)' }}>
                {saveMsg.text}
              </span>
            )}
          </div>
          <Footnote>All persona changes apply live — no mixer restart needed.</Footnote>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ border: '1px solid var(--ink)' }}>
      <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--ink)' }}>
        <span className="v3-eyebrow" style={{ fontSize: 11 }}>{title}</span>
      </div>
      <div className="p-5 space-y-2">{children}</div>
    </section>
  );
}
function FormRow({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>{label}</span>
      </div>
      {hint && <Hint>{hint}</Hint>}
      <div className="flex items-center flex-wrap">{children}</div>
    </div>
  );
}
function Hint({ children }) {
  return <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{children}</div>;
}
function Footnote({ children }) {
  return <div className="v3-caption mt-3" style={{ color: 'var(--muted)' }}>{children}</div>;
}
function SolidButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="v3-eyebrow v3-focus cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 10 }}
    >
      {children}
    </button>
  );
}
function OutlineButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="v3-eyebrow v3-focus cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--ink)', padding: '4px 10px', fontSize: 10 }}
    >
      {children}
    </button>
  );
}
function TextInput(props) {
  return (
    <input
      type="text"
      {...props}
      className="v3-focus"
      style={{
        boxSizing: 'border-box',
        border: '1px solid var(--ink)',
        background: 'transparent',
        padding: '8px 12px',
        fontSize: 13,
        fontFamily: 'inherit',
        color: 'var(--ink)',
        outline: 'none',
        ...(props.style || {}),
      }}
    />
  );
}
function FrequencySegmented({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--ink)' }}>
      {FREQUENCIES.map((m, i) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className="v3-eyebrow v3-focus cursor-pointer"
            style={{
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--bg)' : 'var(--ink)',
              border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--ink)',
              padding: '8px 14px',
              fontSize: 10,
            }}
            aria-pressed={active}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
function Alert({ tone, children }) {
  return (
    <div
      style={{
        border: `1px solid ${tone === 'err' ? '#c5302a' : 'var(--ink)'}`,
        color: tone === 'err' ? '#c5302a' : 'var(--ink)',
        padding: '8px 12px',
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
