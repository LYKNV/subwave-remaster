# Web motion pass — plan

Add `motion` (the package formerly known as framer-motion) plus
`@use-gesture/react` to the web app, in service of making the player
*feel* like a broadcast and the surrounding surfaces — the landing
broadsheet and the admin console — feel coherent with it. Not a
redesign: every existing V3 keyframe in `web/app/globals.css` stays,
motion only supplements.

This is a single rollout in three waves: **player first**, then
**landing**, then **admin**. One branch, one global provider, three
visual languages — broadcast, editorial, operator.

## TL;DR

Three waves under one shared motion provider:

1. **Player wave** — ten targeted enhancements (CenterStage crossfade,
   Sheet exit + swipe-to-dismiss, DotRail `layoutId`, DJ typewriter,
   Tune-In overlay, odometer counters, request chips + form↔success
   morph, booth list, volume keyboard pulse).
2. **Landing wave** — editorial scroll-reveals on the broadsheet
   article sections, `Figure` image + caption stagger, masthead lift on
   first paint, and the embedded `PlayerShowcase` gets the player's
   motion treatment for free.
3. **Admin wave** — functional motion only: nav active-item `layoutId`,
   panel route transitions, table-row list layout for Library / Shows
   / Personas, and the live on-air strip's odometer parity with the
   player.

Two new deps (`motion`, `@use-gesture/react`). One root provider in
`app/layout.tsx` (`LazyMotion` + `MotionConfig reducedMotion="user"`).
No changes to the manual pages or the setup walkthrough.

## Why these and not others

The V3 design language is restrained — newsprint typography, single
vermilion accent, deliberate CRT-feeling cursor blink. The wrong
motion treatment here is "make everything bouncy and Material." The
right treatment is to use motion where the *absence* of animation
currently creates a tiny break in the illusion.

- **Player** — most obviously, audio crossfades smoothly between
  tracks but the cover and title swap instantly. Drawers slide in but
  exit by popping out of existence.
- **Landing** — the broadsheet article is the marketing front door,
  but sections currently land all at once with no acknowledgement of
  scroll position. Editorial-grade publications fade or rise sections
  into view as the reader reaches them; ours should too — restrained
  print-style reveals, not magaziney parallax.
- **Admin** — operator surface, so motion is *functional*: the nav
  active item should morph between groups instead of jumping, panel
  transitions should fade rather than blink, and the live on-air strip
  should breathe at the same cadence as the player's TopBar.

Each item below was picked because it fixes one of those breaks. The
manual pages (`/manual/*`) and the setup walkthrough (`/setup/*`) stay
untouched — they're reference material, animation there is just
friction.

## Library choices

- **`motion`** — primary. React 19-compatible, tree-shakeable. Use
  `LazyMotion` + `domAnimation` to keep the additional JS payload
  small (~12 kB gzip vs ~30 kB for the full bundle).
- **`@use-gesture/react`** — drives swipe-to-dismiss on the Sheet
  drawer. Tiny (~3 kB gzip), works with motion's `useMotionValue` so
  the drag follows the finger pixel-for-pixel instead of going
  through React state.

No Lottie (heavy, off-brand), no confetti (gimmicky for a radio
station), no react-spring (overlaps motion).

## Global wiring (one-time)

Put the provider once in `web/app/layout.tsx`, wrapping `{children}`
inside `<body>`:

```tsx
<LazyMotion features={domAnimation} strict>
  <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
    <ServiceWorkerRegister />
    {children}
  </MotionConfig>
</LazyMotion>
```

- One provider for every route — player, landing, admin, manual,
  setup. Lazy-loaded animation features means ~12 kB gzip is added to
  every page even if it has no motion components (the import graph is
  the same), but only routes that actually use `motion.*` pay the
  per-component cost.
- `reducedMotion="user"` makes every motion component honor the OS
  preference without per-component code. Matches the
  `@media (prefers-reduced-motion: reduce)` block already in
  `globals.css` (line ~355).
- Default transition mirrors the existing
  `cubic-bezier(0.2, 0.7, 0.2, 1)` used in `v3-slide-in-right` and
  `v3-modal-pop`, so motion-driven transitions feel like the same
  family as the existing CSS keyframes.
- `strict` mode forbids the non-lazy `motion` import — guards against
  someone accidentally pulling in the full bundle later.

**Why one root provider, not three per surface:** earlier draft wrapped
each top-level component (`PlayerApp`, `Landing`, `AdminShell`)
separately. That works, but: the embedded `PlayerShowcase` on landing
reuses the same `PlayerApp` tree (no iframe), so its motion components
would lose context if landing weren't also wrapped. One root provider
side-steps the issue and makes the rule trivial: any new route
inherits motion for free, no plumbing.

## Wave 1 — Player (the ten enhancements)

### 1. CenterStage track transition — the biggest win

**File:** `web/components/CenterStage.tsx`

Today, when `nowPlaying` changes, the cover image, title, and artist
swap instantly. Liquidsoap is doing a multi-second audio crossfade
under the hood; the visuals should match.

- Wrap the cover `<img>` in `<AnimatePresence mode="popLayout">`
  keyed on `coverSrc`. Incoming cover: `opacity 0 → 1`, `scale 1.02 → 1`,
  280 ms. Outgoing: `opacity 1 → 0`, 220 ms. They overlap, producing
  a soft cross-dissolve.
- Wrap title + artist + album line in a sibling `AnimatePresence
  mode="popLayout"` keyed on `nowPlaying?.title`. Incoming text rises
  4 px from below as it fades in (`y: 6 → 0`, `opacity 0 → 1`);
  outgoing slides 4 px up and out. Mirrors how DJ liners feel when
  the next track is being introduced.
- The "scanning the dial _" placeholder participates in the same
  AnimatePresence — when the first track arrives, it gracefully
  yields.

**Risk:** none. CenterStage is purely presentational.

### 2. Drawer exit animation

**File:** `web/components/ui/sheet.tsx`

The Sheet comment literally reads "No exit animation." Today, the
`v3-slide-in-right` keyframe plays on mount, but on close the
Radix Dialog content is unmounted instantly — the drawer pops out of
existence. This is the most consistently noticeable rough edge.

- Wrap the `<Dialog.Content>` (and `<Dialog.Overlay>`) in
  `<AnimatePresence>` driven by the `open` prop. Use Radix's
  `forceMount` pattern so motion controls the exit before Radix
  unmounts.
- Entrance keeps the existing `v3-slide-in-right` CSS keyframe to
  avoid double-animating. Exit is motion: `x: 0 → 100%`, `opacity 1 → 0`,
  200 ms. Overlay fades out in parallel.
- Add a custom variant for the contained (landing-embedded) drawer
  — when `container` is set, exit translates by the parent width
  fraction rather than 100% of viewport.

**Risk:** medium. Radix Dialog + AnimatePresence requires the
`forceMount` + manually-controlled state pattern; the failure mode is
the drawer not unmounting at all. Will test the open/close cycle
explicitly, including back-to-back open of different drawers (Sheet
swaps `children` while open — exit should *not* play on a child
change).

### 3. DotRail active indicator with `layoutId`

**File:** `web/components/DotRail.tsx`

Today, the ink-filled active tab background is rendered conditionally
per-item — clicking a different tab causes the ink block to vanish
from the old position and reappear in the new one, instantly.

- Render the active background as an absolutely-positioned
  `<motion.div layoutId="dot-rail-active">` inside the active tab.
- Motion will automatically morph the block between positions when
  the active prop changes — same trick used in macOS Dock magnification
  and modern tabbed UIs.
- Keep the text-color contrast swap (`text-bg` when active) as a
  plain class toggle — motion only owns the background block.
- Set `initial={false}` on the parent `AnimatePresence` so the active
  block doesn't animate in from nowhere on first paint.

**Risk:** low. `layoutId` is the most mature motion API.

### 4. DJ thinking line — graceful re-type

**File:** `web/components/DjThinkingLine.tsx`

The typewriter is currently a 42 ms `setInterval` over the text
string. It works, but mid-type interruption (new turn arrives while
the old one is still typing) cuts hard. Motion lets us treat each
character as a child with a stagger, which gives free interrupt
handling and an opportunity for a tiny blur-in.

- Replace the `setInterval` typewriter with characters mapped to
  `<motion.span>` children, parent uses
  `transition={{ staggerChildren: 0.042 }}`.
- Each character animates `opacity 0 → 1`, `filter blur(2px) → blur(0)`,
  120 ms.
- Wrap the whole line in `<AnimatePresence mode="wait">` keyed on
  `turnId` so a new turn exit-animates the old text before the new
  one begins typing (instead of the current behavior, which resets
  state mid-frame).
- Keep the existing `v3-blink` cursor — it's intentional CRT vibe,
  motion would smooth it and ruin the character.

**Risk:** medium (not low — earlier draft underrated this).
Per-character DOM nodes balloon for long lines; `mode="wait"` means
new turns wait for the old to fade. If a turn lands while the previous
is still typing, perceived feedback is *slower* than today's hard cut.
Mitigation: cap stagger so total enter time stays under 600 ms
regardless of line length (`staggerChildren = min(0.042, 0.5 / length)`).
Verify against the longest real DJ line in `state/session.json`
samples before shipping.

### 5. Tune-In overlay — dismiss like a physical dial

**File:** `web/components/TuneInOverlay.tsx`

Currently a `v3-fade-in` on mount and a CSS pulse on the play disc.
Dismiss is instant.

- Wrap the overlay button in `motion.button` with an `exit` variant:
  the play disc scales to 1.6× while opacity goes to 0, the rest of
  the overlay washes out 80 ms later. Feels like the dial engaging.
- Triggered by lifting the conditional render up to the parent
  (PlayerApp) inside `<AnimatePresence>` so the unmount is
  exit-animated.
- Keep the existing `v3-tunein-pulse` ring — that's the on-mount
  attention-getter, motion handles the dismount.

**Risk:** low.

### 6. Listener count + queue length — odometer

**Files:** `web/components/TopBar.tsx`, `web/components/DotRail.tsx`

When `listeners.current` changes from 3 to 4, or the queue length
goes from 5 to 6, the digit currently jumps. Tiny but the station
feels more alive when numbers visibly tick.

- Wrap the listener-count digit in `<AnimatePresence mode="popLayout">`,
  key on the value itself. New digit slides in from above (`y: -8 → 0`,
  `opacity 0 → 1`), outgoing slides down and out.
- Same treatment on the timeline count in DotRail. Skip when the
  count is an icon ReactNode (the History/Mic fallbacks) — only
  numeric values get the odometer.
- Factor into a tiny `<OdometerNumber value={n} />` component — it's
  reused on the admin shell header.

**Risk:** low.

### 7. Suggestion chips — stagger on drawer open

**File:** `web/components/drawers/RequestDrawer.tsx`

Today, the chip row appears all at once when the Request drawer
opens.

- Parent chip container becomes `<motion.div>` with `staggerChildren:
  0.04` and `delayChildren: 0.12` (so the chips arrive *after* the
  drawer's slide-in finishes).
- Each chip is `<motion.button>` with `initial={{ opacity: 0, y: 4 }}`,
  `animate={{ opacity: 1, y: 0 }}`.
- On chip tap: `whileTap={{ scale: 0.96 }}` for haptic feel before
  the textarea fills.

**Risk:** low.

### 8. Request → Success card morph

**File:** `web/components/drawers/RequestDrawer.tsx`

Today, when the request is accepted, the form is replaced by the
SuccessCard in a hard swap. The drawer body height jumps.

- Wrap the conditional (`result?.success ? <SuccessCard /> : <Form />`)
  in `<AnimatePresence mode="wait">`. Each subtree animates
  `opacity` and a small `y` translate on enter/exit (120 ms each).
- Wrap the outer container in `<motion.div layout>` so the height
  change is springed instead of snapped.
- The pending → resolved transition *inside* SuccessCard (templated
  ack morphs into the real track) gets the same treatment: the
  "finding your track…" line is a `motion.div` with `layout` so when
  it's replaced by the resolved track title, the height eases.

**Risk:** medium. `layout` animations can fight with `overflow:
hidden` on the drawer scroll container; will verify the scroll
behavior on a tall success card doesn't get clipped mid-animation.

### 9. Booth feed — new-turn entry

**File:** `web/components/drawers/BoothDrawer.tsx`

New session turns currently appear at the top with no animation.
With the 5 s feed poll, this means batches of turns can suddenly
pop in.

- The filtered list becomes a `<motion.div>` containing
  `motion.div` children, each keyed on `turnKey(turn, i)`, with
  `layout` so existing entries push down when new ones insert.
- New entries enter with `opacity 0 → 1` and `y: -8 → 0` (slide down
  from above, mimicking a teletype line feeding in).
- Filter switches are not animated — feels like an admin gesture,
  shouldn't have weight.

**Risk:** low. List-layout animations are well-trodden in motion.

### 10. Volume cells — spring on keyboard adjust

**File:** `web/components/TransportBar.tsx`

The 12 volume cells light up correctly today but with no transition,
which is correct when dragging the invisible slider (the cells need
to track the finger). But when the user uses Arrow Up / Arrow Down
shortcuts (defined in `PlayerApp.tsx`, ±5%), the newly-lit cell could
spring-pulse to make the keyboard action feel responsive.

- Each cell becomes `<motion.span>` with a `key` that includes its
  `lit` state, and a `whileInView`-style scale pulse triggered by a
  `pulseTrigger` prop that changes only on keyboard-driven volume
  changes.
- Distinguishing keyboard vs slider: the slider's `onValueChange`
  doesn't set the pulse trigger; the keyboard handler does.
- Pulse is short and small (110 ms, scale 1 → 1.18 → 1) — barely
  visible, but the page *feels* responsive when you tap Arrow Up.

**Risk:** low. Honest note: this one's gold-plating. If the rollout
runs over, drop it without regret.

### Sheet swipe-to-dismiss (mobile)

**File:** `web/components/ui/sheet.tsx`

Mobile-only enhancement. The right-side drawer should dismiss with a
rightward swipe, the same gesture pattern iOS/Android users expect
from a side sheet. Bundled with item 2 above because they share the
`forceMount` refactor.

- Use `useDrag` from `@use-gesture/react` on the Dialog.Content,
  binding to `useMotionValue('x')`.
- Threshold: 80 px or 0.4 viewport-width-velocity → call
  `onOpenChange(false)`. Below threshold, spring back to 0.
- Lock the gesture to horizontal-only — vertical drag must still
  scroll the drawer body.
- Disabled on the contained (landing-embedded) drawer — that one
  lives inside a card and shouldn't move independently of the page.
- Disabled with `prefers-reduced-motion: reduce` — the spring-back
  involves visible motion the user has opted out of.

**Risk:** medium. Gesture handlers and scrollable content compete;
the gesture only activates when the initial touch is on the drawer
chrome (header, padding) or when the body is scrolled to the top.
Spike this in a branch before committing to the rollout list — if the
interaction proves fiddly, ship item 2 (exit animation) without the
gesture.

## Wave 2 — Landing (broadsheet article)

The landing page at `/landing` (and the dual-homepage variant via
`SUBWAVE_HOMEPAGE=landing`) is a newsprint-style feature article. The
goal is **editorial-grade restraint**: sections reveal as the reader
arrives at them; figures fade and their captions follow; the masthead
lifts gently on first paint. No parallax, no scroll-jacking, no
horizontal slides — those belong in glossy magazine sites, not in a
broadsheet.

### L1. Section reveal on scroll

**Files:** `web/components/what/{ArticleHead,OnTheAir,MeetTheVoices,MakeARequest,BehindTheDesk,UnderTheHood,Coda}.tsx`,
`web/components/landing/{Navidrome,StationFooter}.tsx`

Wrap each top-level section in a small shared component
`<EditorialReveal>` that uses `whileInView` with `once: true,
margin: "0px 0px -10% 0px"`. Animation is deliberately small —
`opacity 0 → 1`, `y: 12 → 0`, 360 ms, default ease — so it reads as
"the page is finishing settling" rather than "the page is performing
for you."

- First section (`ArticleHead`) animates on mount instead of scroll
  — readers don't scroll up from above the fold.
- Heading + subhead inside each section get a 60 ms stagger so the
  display type lands before the body copy.
- Skip on `prefers-reduced-motion: reduce` — `MotionConfig` handles
  this globally, but verify `whileInView` still triggers (it should
  — `reducedMotion="user"` only suppresses the animation, not the
  visibility callback).

**Risk:** low. Single trigger per section, no continuous scroll
listeners.

### L2. Figure image + caption stagger

**File:** `web/components/what/Figure.tsx`

Currently the figure (image + caption) appears all at once when its
parent section reveals. Editorial publications fade the image first
and the caption immediately after — it mimics the reading order.

- Image (or placeholder box) animates `opacity 0 → 1`, 280 ms.
- Caption animates `opacity 0 → 1`, `y: 6 → 0`, 220 ms, with a
  `delay: 0.18` so it follows the image.
- Both are `whileInView`-driven, sharing the same single-trigger
  pattern as L1.

**Risk:** low.

### L3. Masthead lift on first paint

**File:** `web/components/landing/Masthead.tsx`

The masthead (the SUB/WAVE nameplate + dateline) currently snaps into
the viewport on initial paint. A 400 ms `y: -8 → 0, opacity 0 → 1`
lift on the wordmark + a 200 ms delayed fade on the dateline gives
the page a sense of "the broadsheet has just been opened."

- Wordmark: `initial={{ y: -8, opacity: 0 }}, animate={{ y: 0, opacity: 1 }}`, 400 ms.
- Dateline + meta row: `initial={{ opacity: 0 }}, animate={{ opacity: 1 }}`,
  220 ms, `delay: 0.18`.
- Theme toggle: no animation — it's a control, not editorial chrome.

**Risk:** low.

### L4. Embedded player gets full player motion

**Files:** `web/components/landing/PlayerShowcase.tsx` (no changes),
plus everything the player wave already covers.

`PlayerShowcase` mounts `<PlayerApp contained />` inside the
browser-chrome frame — it's the *same React tree* as the standalone
player, so every motion enhancement from Wave 1 (CenterStage
crossfade, DotRail `layoutId`, request drawer, booth list, odometer
counters, etc.) automatically applies to the embed when motion is
loaded.

This resolves the open question from the earlier draft: yes, the
embed pays the motion bundle cost. With `LazyMotion` hoisted to
`app/layout.tsx`, the cost is paid once for the whole app — adding it
to landing specifically costs nothing more. The embed should look
like the real player; making it stiller would be more work and would
undersell the product.

The Sheet swipe-to-dismiss gesture is *disabled* in `contained` mode
(documented under the Sheet section above) — the contained drawer
shouldn't slide independently of the landing card it lives in.

**Risk:** none. No new code; this is a consequence of the hoist.

### L5. Browser chrome dot pulse

**File:** `web/components/landing/PlayerShowcase.tsx`

The mock browser chrome already has a red "LIVE" indicator with a
CSS-pulse dot (`bs-live-dot`). Leave the CSS pulse alone — it's the
right vibe — but when the showcase section first reveals via L1, add
a one-shot 600 ms `scale: 0.8 → 1` pulse on the LIVE chip itself so
the "live" callout draws the eye as the section arrives. Subsequent
appearances (if the user scrolls away and back — but L1 is
`once: true`, so they won't) don't repeat.

**Risk:** low. Decorative; drop if landing wave runs long.

## Wave 3 — Admin (operator console)

Admin is operator UI — dense, fast, used by exactly one person (the
station owner) for tasks that need to feel snappy. Motion here is
strictly **functional**: it should communicate state, not perform.
Anything that adds wait time or attention-grabbing weight gets cut.

### A1. Nav active-item `layoutId`

**File:** `web/components/admin/AdminShell.tsx`

The grouped left nav (`Monitor` / `Programming` / `System`) toggles
an `.active` class on the current item. Today the active-state
background is per-item, so jumping from `Dash` to `Library` to
`Settings` causes the highlight to vanish and reappear.

- Render the active background as an absolutely-positioned
  `<motion.div layoutId="admin-nav-active">` inside the active item.
- The ID is shared *across nav groups*, so the indicator morphs
  smoothly even when jumping between sections (`Monitor` → `System`).
- `initial={false}` on the parent so the indicator doesn't animate
  from nowhere on first paint after sign-in.
- Same trick as DotRail item 3 — both share visual language.

**Risk:** low.

### A2. Panel route transitions

**File:** `web/app/admin/layout.tsx` (or a small `AnimatedOutlet`
wrapper around `{children}` in `AdminShell.tsx`)

Today, switching between admin panels (`Dash` → `Library` → `Stats`)
is an instant unmount/remount — the screen blinks. A 120 ms cross-fade
makes the navigation feel like the same shell, not a full reload.

- Wrap the `<main>` child in `<AnimatePresence mode="wait">` keyed
  on `pathname` (the existing `usePathname()` already in the shell).
- Panel enter: `opacity: 0 → 1`, 120 ms.
- Panel exit: `opacity: 1 → 0`, 100 ms.
- No `y` translate — operator surface, vertical drift would feel
  twitchy when clicking through a list of panels.

**Risk:** medium. Panel components fetch data in `useEffect` on
mount; `AnimatePresence` could delay the unmount of the old panel
while the new one starts mounting, briefly running both. Verify no
duplicate fetches by checking the Network tab during a fast
panel-to-panel click. If it's a problem, key on `pathname` with
`mode="popLayout"` instead so old and new are visually overlapped but
unmount happens immediately.

### A3. Live on-air strip parity with player

**File:** `web/components/admin/AdminShell.tsx` (`ShellHeader`)

The header has a live "on air / off air" dot + listener count, fed by
the same `useStationFeed` hook as the player TopBar.

- Use the shared `<OdometerNumber />` extracted in player item 6 for
  the listener count. Same vertical-slide treatment, matched cadence.
- The on-air dot already uses `useDynamicStyle` to swap colour
  between `var(--accent)` and `var(--muted)`. Wrap the dot in
  `motion.span` with a 180 ms `scale: 1.4 → 1` pulse triggered when
  `onAir` flips from false → true (track just started). False → false
  and true → true: no animation.
- The "← player" link, theme toggle, and sign-out button stay
  motionless — they're chrome controls.

**Risk:** low.

### A4. Table-row list layout — Library / Shows / Personas

**Files:** `web/components/admin/LibraryPanel.tsx`,
`web/components/admin/ShowsPanel.tsx`,
`web/components/admin/PersonasPanel.tsx`

These panels render lists of records (mood-tagged tracks, scheduled
shows, DJ personas) where rows can be added, edited, or removed. Row
mutations today cause the list to re-render and the surrounding rows
to jump.

- Each row container becomes `<motion.div layout>` (or
  `<motion.tr layout>` if the panel uses a `<table>`).
- New rows enter with `opacity: 0 → 1`, `y: -6 → 0`, 200 ms.
- Removed rows exit with `opacity: 1 → 0`, 160 ms.
- Reordering is `layout`-driven, no explicit animation needed.
- Skip the list animation while bulk operations are running (e.g.
  the tag-library job inserts hundreds of rows at once — set a
  `bulkMode` flag while the SSE stream is active and disable
  per-row layout to avoid hundreds of simultaneous spring
  calculations).

**Risk:** low for steady-state, medium during bulk tagging. The
`bulkMode` gate is the mitigation.

### A5. Settings save feedback

**File:** `web/components/admin/SettingsPanel.tsx`

The settings panel is 1784 lines of forms with a `Save` button per
section. Today the save flow shows a toast on success — sufficient
but the page itself doesn't acknowledge the save. A subtle local
acknowledgement closes the loop without competing with the toast.

- The `Save` button gets a `whileTap={{ scale: 0.97 }}` on press —
  haptic feel before the network call.
- On successful save, the relevant section's heading gets a one-shot
  220 ms `opacity 1 → 0.4 → 1` blink — barely perceptible, but the
  operator's peripheral vision sees the section "settled."
- On error, no animation — the toast already handles error states
  loudly.

**Risk:** low.

### A6. Debug log live tail

**File:** `web/components/admin/DebugPanel.tsx`

The debug panel shows recent LLM calls (a 30-entry ring buffer) and
controller logs. New entries currently append on poll with no
animation.

- Same teletype slide-in as the BoothDrawer (player item 9): new
  entries enter `opacity: 0 → 1`, `y: -8 → 0`, 140 ms.
- `layout` on the parent container so existing entries push down
  smoothly as new ones arrive.
- Disable during filter changes (rebuilding the list shouldn't
  animate every row).

**Risk:** low.

### Things deliberately left out of the admin wave

- **No animated charts in `StatsPanel`** — operator wants to read
  numbers, not watch them count up. The chart values change as data
  updates; that's it.
- **No hover effects on nav items beyond what's already in CSS** —
  density matters, hover-grow is a portfolio-site move.
- **No animated drawer open in `Personas` / `Shows` edit forms** —
  these are full-page panels, not drawers; instant is correct.
- **No sign-in form motion** — `SignInForm.tsx` should snap on
  password entry. Operator wants the gate to feel like a gate.

## Things deliberately left untouched (project-wide)

- **`web/components/Waveform.tsx`** — already paints at 60 fps via
  `requestAnimationFrame` directly to DOM. Motion would add overhead
  for zero visual gain.
- **`web/components/TransportBar.tsx` hairline progress bar** — driven
  by a CSS variable updated every poll. Already smooth.
- **`web/app/globals.css` keyframes** — `v3-blink`, `v3-tunein-pulse`,
  `v3-connecting-pulse`, `v3-fade-in`, `v3-slide-in-right`,
  `v3-modal-pop`, `bs-live-dot` pulse all stay. Some are referenced by
  motion-wrapped components (Tune-In overlay's pulse ring; drawer's
  entrance keyframe; landing's live chip). The aesthetic CRT cursor
  blink must stay as `steps(1)` — motion would tween it.
- **Manual pages (`web/components/manual/*` + `web/app/manual/**`)**
  — reference docs. Readers come here to look up specifics; animation
  is friction.
- **Setup walkthrough (`web/app/setup/**` + `web/components/setup/*`)**
  — bootstrap flow used once per install. Snap-fast is correct.
- **Theme toggle (both player and admin variants)** — colour swap
  is the animation; wrapping it in motion would dilute the snap.
- **Wordmarks across the app** — reference frames, should stay still
  in their resting state (the L3 masthead lift is a *first paint*
  animation, not a permanent one).

## Performance notes

- `LazyMotion` + `domAnimation` adds ~12 kB gzip to every route's
  shared bundle. The full motion bundle (`domMax`) would be ~30 kB;
  none of these waves need its extras (drag-and-drop reordering,
  3D transforms).
- All transitions are GPU-friendly (`opacity`, `transform: translate /
  scale`). No animated `height`, `width`, `top`, `left`, or
  `box-shadow` except where `layout` is involved, and there only on
  small surfaces (success card body, booth list, admin tables, debug
  log).
- `useStationFeed` polls every 5 s — none of these animations depend
  on poll cadence; they're driven by value changes, so a steady-state
  station shows no churn.
- Admin tables: `layout` animations on 200+-row Library lists during
  bulk tagging would peg a CPU core. The `bulkMode` gate in A4 turns
  off per-row layout while the tag-library SSE job is active.
- Landing `whileInView` reveals use `once: true` so the IntersectionObserver
  detaches after firing — no continuous scroll listener.

## Rollout

One branch, three waves of commits, one PR. Each commit is
independently reviewable; the waves are landed in order so reviewers
can verify wave N before wave N+1 builds on its shared components
(`OdometerNumber`, the `layoutId` pattern, the `EditorialReveal`
wrapper).

**Wave 1 — Player (commits 1–10):**

1. Deps (`motion`, `@use-gesture/react`) + root provider in
   `app/layout.tsx` (`LazyMotion` / `MotionConfig`).
2. CenterStage track transition.
3. Sheet drawer exit + swipe-to-dismiss together (they share the
   forceMount refactor).
4. DotRail `layoutId`.
5. DjThinkingLine motion typewriter (with stagger cap; verify against
   real session samples).
6. TuneInOverlay exit.
7. Listener / queue odometer (extract shared `<OdometerNumber />`).
8. RequestDrawer chips + form↔success morph.
9. BoothDrawer list layout.
10. Volume keyboard pulse.

**Wave 2 — Landing (commits 11–14):**

11. `<EditorialReveal>` wrapper + section-by-section adoption (L1).
12. `Figure` image+caption stagger (L2) + Masthead lift (L3).
13. Verify embedded `PlayerShowcase` works (L4 — should be a no-op
    code change, just a manual QA pass on the landing-embedded drawers
    and CenterStage swap).
14. PlayerShowcase LIVE-chip pulse (L5).

**Wave 3 — Admin (commits 15–20):**

15. AdminShell nav `layoutId` (A1).
16. Panel route transitions in `admin/layout.tsx` (A2).
17. Header on-air strip parity using shared `<OdometerNumber />` (A3).
18. LibraryPanel + ShowsPanel + PersonasPanel row layout + bulk-mode
    gate (A4).
19. SettingsPanel save feedback (A5).
20. DebugPanel live tail (A6).

Each commit message names the V3 keyframe it interacts with (if any)
and the wave it belongs to, so future archaeology on the animation
system is easy.

## Resolved questions

- **DotRail `layoutId` initial mount:** set `initial={false}` on the
  parent so the first paint doesn't animate the active block in from
  nowhere. (Item 3.) Same call for the admin nav `layoutId`.
- **Embedded player on `/landing`:** gets the full player motion
  treatment. With `LazyMotion` hoisted to `app/layout.tsx`, the bundle
  cost is paid once for the whole app — making the embed stiller
  would be more work and undersell the product. The Sheet swipe
  gesture is disabled in `contained` mode (the only place where the
  embed motion intentionally diverges from the standalone player).

## Open questions (still TBD)

- **Manual pages (`/manual/*`)** are excluded from the rollout, but
  they share `app/layout.tsx` so they pay the 12 kB bundle cost. If
  /manual traffic turns out to be a meaningful share of total page
  loads, consider whether the root `LazyMotion` should be moved into
  a layout segment that excludes `/manual` and `/setup`. Not blocking
  the rollout — measure first.
- **Bulk-tagging UX in A4:** the `bulkMode` gate disables per-row
  layout during the SSE stream, but it also means new rows pop in
  without animation. Acceptable? Or should we show a single "tagging
  in progress" spinner instead and only animate the *final* settled
  list? Worth a decision before committing A4.
