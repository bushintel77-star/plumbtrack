---
name: mobile-fsm-ui-design
description: Use when designing or prototyping mobile UI for field service management (FSM) / field management software — technician job screens, work orders, dispatch, inspections, service history, delivery or route apps, or any interface used by field workers on a phone. Establishes aesthetic direction, layout, color, and typography before code, plus field-specific requirements (offline/sync states, outdoor legibility, glove-friendly touch targets, safety-standard status color systems) that generic web/app UI guidance misses. Trigger whenever the user is designing a field service, trade, maintenance, inspection, delivery, or technician-facing mobile app — even if they describe it as "an app for my plumbers/electricians/drivers/inspectors" rather than saying "FSM."
---

# Mobile FSM UI Design

A design skill for the mobile, field-facing side of field service management software: the screens a technician, driver, inspector, or field worker actually uses on a phone — job lists, work order detail, checklists, capture flows, dispatch, and status. This is not a general mobile-app skill wearing a different label. Field apps have failure modes a generic aesthetic checklist won't catch: glare, gloves, dead zones, urgency, dirty hands.

## Activation Contract

### Use this first when
- The request is to decide visual direction, produce a design specification, or prototype screens for a mobile app used by field/mobile workers (trades, delivery, inspection, home service, utility, maintenance, healthcare-at-home, courier, etc.).
- Layout, typography, color, and interaction choices need to be made before implementation.

### Read before writing code if
- Visual rules (color, type, spacing, layout, status system) don't exist yet for this app.
- The user asks for "design," "prototype," "look and feel," "mockup," or "how should this screen work" rather than a straight code change.

### Then also read
- Once the design spec is set, use your project's implementation skill for the target mobile stack (React Native, Flutter, or an installed web/PWA frontend skill) to turn it into code.
- If this FSM product also has an office/dispatcher/admin web app, treat that as a separate design pass — larger screens, less urgency, more density — not covered here. Use the `dashboard-ui-design` skill for that pass.

### Do NOT use for
- Backend logic, scheduling/dispatch algorithms, database or data-model design.
- Design of the office/dispatcher desktop web app (different device, different constraints).
- Straight implementation of an already-approved design with no open visual decisions.

### Common mistakes / gotchas
- Designing as if the user is sitting at a desk: ignoring sunlight glare, gloves, wet or dirty hands, one-handed use, or working while standing or walking.
- Treating offline or spotty signal as an edge case instead of a normal, first-class state every screen needs to handle.
- Reaching for a generic "vibrant SaaS dashboard" look that reads as an office tool, not something built for the field.
- Sizing touch targets for a mouse pointer or a bare fingertip, not a gloved thumb.
- Porting office/dispatcher information density onto the phone screen instead of simplifying for the field.
- Inventing an arbitrary color palette instead of a deliberate status system — status color is functional here, not decorative.
- Skipping the design specification and jumping straight to code.

---

## Mandatory Pre-Design Specification

**Before writing any interface code, output this analysis explicitly:**

```
DESIGN SPECIFICATION
====================
1. Purpose Statement: [who is the field user (technician / driver /
inspector / carer...),
   what's the core job-to-be-done, in what physical context]

2. User Context & Constraints:
   - Environment: outdoor/indoor, weather exposure, noise,
dirty/wet/gloved hands
   - Connectivity: offline-first required? spotty signal? sync model?
   - Device: phone size, one-handed use, ruggedized device,
mounted/hands-free?
   - Urgency: routine job vs. active/emergency dispatch
   - Regulatory/safety context: any industry safety-signage or compliance
convention to respect

3. Aesthetic Direction: [ONE clear direction — see options below.
FORBIDDEN: "modern", "clean", "simple"]

4. Color Palette: [3-5 core colors with hex codes, PLUS a separate
semantic status system]
   ❌ FORBIDDEN DECORATIVE COLORS: purple (#800080-#9370DB), violet
(#8B00FF-#EE82EE),
      indigo (#4B0082-#6610F2), fuchsia (#FF00FF-#FF77FF), blue-purple
gradients

5. Typography: [exact font names, minimum sizes for outdoor/glance
legibility]
   ❌ FORBIDDEN FONTS: Inter, Roboto, Arial, Helvetica, system-ui, -
apple-system

6. Layout Strategy: [thumb-zone placement, one-handed reach, working-
screen grid vs.
   brand-screen creative license — see "Where to Break the Grid" below]
```

**Aesthetic Direction options** (choose one, execute with precision):
- **Industrial / utilitarian** — instrument-panel feel, built for a toolbelt, not an office
- **Brutally minimal** — stripped to the job, near-zero chrome
- **Rugged / tactical** — high contrast, hard edges, built-to-survive-a-drop feel
- **Editorial / high-clarity** — calmer, warmer, still information-first (fits home care, concierge services)
- **Luxury / refined** — for premium/concierge field services, never at the cost of legibility
- **Playful / bold** — fits fast, high-volume work like courier/delivery

Avoid maximalist chaos, soft/pastel, and art-deco/geometric as primary directions — they tend to fight the domain's real priority: a worker glancing at a screen for two seconds mid-job.

### Context-aware defaults
- **Trades / utility / plumbing / HVAC / electrical**: industrial or brutally minimal, often dark-theme (glare and battery friendly); semantic status color drives the hierarchy more than brand color.
- **Home care / healthcare-at-home**: editorial/high-clarity, warmer palette, still high-contrast — the worker may be reading it while also managing a person.
- **Delivery / courier / logistics**: playful/bold or brutally minimal — speed and glanceability over personality; route/ETA is the hero content.
- **Inspection / audit / compliance**: brutalist/raw or editorial clarity — checklist and evidence capture are the interface, not decoration around it.
- **Premium/concierge field services**: luxury/refined is fair game, but touch targets and contrast stay exactly as strict as any other direction.

---

## Field-Specific Requirements (what a generic UI skill won't tell you)

### Offline & sync states are not optional
Every screen that shows or submits data needs a defined offline appearance and a defined "queued/syncing" appearance. Never let the UI imply it's live when it isn't — show an explicit, honest status (e.g. a small badge: *queued*, *syncing*, *synced*, *failed — tap to retry*). Silent failure in the field means a completed job that never reaches the office.

### Outdoor legibility
Assume direct sunlight, not an office monitor. Push contrast higher than a typical mobile app, avoid relying on subtle tonal differences to communicate state, and treat full-bleed glossy-white backgrounds with caution — they glare badly outdoors. A dark, high-contrast theme is a strong default for outdoor field work, but it's a real decision to make and justify in the spec, not an assumption.

### Touch targets for gloved, wet, or dirty hands
Primary actions need meaningfully larger targets than a desk-bound mobile app — treat standard mobile touch-target minimums as a floor, not a target, for anything a technician taps mid-job. Never make a critical action (complete job, capture photo, call for help) a small icon-only tap target.

There's a second, separate reason minimal-tap design matters here beyond physical conditions: the trade workforce skews older and less phone-native than most consumer app audiences (average technician age is commonly cited around the mid-40s), and software adoption friction is consistently reported as one of the biggest rollout risks for field service tools. Count taps for any core flow (view job → navigate → complete) and try to beat 4; a competing pattern worth knowing is a home screen limited to a handful of named sections with no landing dashboard, and key facts (address, time) visible on the list card itself so a technician never has to tap in just to see where they're going.

Cutting taps isn't only a navigation problem — it's also a data-entry problem, and that half is solved on the backend, not in the UI. Wherever the system already knows or can compute something (customer and job details already on record, the likely outcome, the next checklist item, a default that's right most of the time), surface it pre-filled and let confirming it be the interaction, not typing or selecting it from scratch. Push the lookup, the computation, and the defaulting logic server-side so the technician's job is "confirm this is right" far more often than "fill this in" — that's a heavier backend and a lighter interface trading places on purpose, not a shortcut.

### One-handed, thumb-zone layout
Field workers are often holding a tool, a ladder, or a clipboard in the other hand. Put primary actions within easy thumb reach (typically the lower half of the screen), avoid actions that need two hands or precise multi-touch gestures, and don't bury the primary action behind a menu.

### Status is a system, not a color choice
Job/work-order status needs one consistent, scannable system used everywhere: color + icon + label together, never color alone (colorblind-safe, and legible in bad light). In a trade or safety-regulated context, consider aligning the semantic meaning of red/amber/green to the safety-signage convention workers already know from the job site (danger/urgent, caution/pending, safe/complete) rather than inventing a new meaning for familiar colors.

### Capture flows are core UI, not an afterthought
Photo capture, signature capture, barcode/QR scanning, and voice notes are primary interactions in FSM apps, not secondary features. Give them dedicated, forgiving UI: large capture buttons, easy retry, and something that still reads against a bright or dark background or a shaky hand.

### Be transparent about location and time data in the UI itself
If the app captures GPS or timestamps (clock-in/out, arrival, job location), show the worker what's being captured and when — a visible, honest indicator builds trust; a hidden one erodes it. Point-in-time capture (e.g. only at clock-in/clock-off) and continuous background tracking are very different trust propositions — the interface should make it obvious which one this is.

### Technician view ≠ office view, shrunk
Resist porting the density of the dispatcher/admin screen onto the phone. The field app should surface only what's needed for the job at hand; the office app can hold the density, filters, and reporting. If you're designing both, they should feel like two purpose-built products, not one responsive layout.

---

## Where to Break the Grid vs. Where to Standardize

The instinct to "avoid generic AI layouts" is right, but it needs careful aim in this domain:

- **Brand/orientation screens** (login, splash, onboarding, empty states, celebratory job-complete moments) — full creative license. Asymmetry, motion, personality, grid-breaking all belong here.
- **Working screens** (job list, job detail, checklist, forms, capture flow) — prioritize a predictable, consistent grid and placement over visual flair. A worker under time pressure needs to find the same button in the same place every time. Express the aesthetic direction here through color, type, iconography, and motion feedback — not through unpredictable layout.

Decorative backgrounds (gradient mesh, noise, texture) are fine on brand screens; keep working screens close to flat and high-contrast so data stays legible outdoors.

### Anti-patterns (never do this)
```tsx
// ❌ Decorative gradient competing with the status system
className="bg-gradient-to-br from-violet-600 to-fuchsia-600"

// ✅ Restrained base palette; status lives in its own token set
className="bg-slate-900" // industrial dark base
// status-urgent: red-600 · status-pending: amber-500 · status-
complete: emerald-600

// ❌ Critical action as a small icon-only tap target
<button className="w-6 h-6"><CameraIcon /></button>

// ❌ Editorial, unpredictable layout on a working screen used under
time pressure
<div className="grid grid-cols-12 rotate-1">
  <div className="col-span-5 col-start-3 -mt-8">{/* job checklist
*/}</div>

// ✅ Large, labeled, predictable action in the thumb zone
<button className="w-full h-14 rounded-lg bg-emerald-600 text-white text-
lg font-semibold">
  <CameraIcon className="inline w-6 h-6 mr-2" /> Capture Photo
</button>

// ❌ Emoji as a status icon
<span>✅ Done</span>

// ✅ Professional icon + text label — never color alone
<CheckCircleIcon className="w-5 h-5 text-emerald-600" />
<span>Complete</span>
```

---

## Typography, Color, Motion, Icons

### Typography
- Avoid generic fonts (Inter, Roboto, Arial, system fonts) — pick a distinctive pairing that still holds up at a glance and in bright light.
- Set a higher minimum body/data size than a typical consumer app, and avoid thin/light weights for anything the worker needs to read quickly.
- A concrete scale that holds up under research (glance-reading and outdoor-legibility studies, not blog consensus): 12 / 14 / 16 / 20–22 / 28 / 40px+, body never below 16px, floor of 12px for anything. Build hierarchy from size and weight (Regular body, Medium/Semibold titles, Bold/Black for hero numerals) — color stays reserved for status meaning, not hierarchy.
- Condensed display faces read glanceably at large sizes only — one cited study found condensed text needs ~11% more reading time than regular width. Keep a condensed/industrial display face to headers and hero numerals at 24px+; drop to the body face the moment it's read as a phrase or shown small.
- Give numeric data (timestamps, IDs, live counters) a monospace or tabular-figure face so digits don't shift width as values update.
- Dark mode: the common "bump weight up one step in dark mode" advice is only half-supported — the strongest primary study found no dark-mode readability benefit from increased weight at the default grade, so don't over-bold by default. What's real is halation: avoid thin/light weights and pure-white-on-pure-black specifically (soften to ~87% white on a charcoal surface, not pure black), since thin strokes are what bloom and dissolve on OLED.

### Color & theme
- Use design-token/CSS variables so the palette and the status system stay consistent everywhere.
- Decide the status system (job/work-order state) before extending the brand palette for decoration — don't let a nice gradient compete with what the status color is trying to say.
- If the product already has a locked brand palette or a mandated safety-color convention, treat that as a higher-priority constraint than anything above, and note the override explicitly in the spec.

### Motion
- Favor CSS/native-driver-only animation for performance on field devices, which are often mid-range and not always on Wi-Fi.
- Because gloves and quick taps can defeat haptic feedback, lean on clear visual confirmation for every tap on a critical action (capture, submit, complete) — motion is compensating for a missing physical cue, not just decoration.
- Reserve one well-orchestrated moment (e.g. job-complete, sync success) rather than scattering micro-interactions everywhere a worker is trying to move fast.

### Icons
- Never use emoji as icons.
- Use a professional icon library appropriate to the stack (Lucide, Phosphor, Feather, or Heroicons for web/React Native; FontAwesome or Material Icons elsewhere) and stay within one library for consistency.

---

## Design Constraints

Unless told otherwise, scope a first prototype to the core loop:
**Auth/clock-in → Job list ("today's jobs") → Job detail (checklist / capture / complete) → Sync/profile status.** That's usually enough to prove out the aesthetic direction and the field-specific requirements above without over-building. Expand only if asked.

---

## Self-Audit Before Submitting

1. **Color audit** — any decorative purple/violet/indigo/fuchsia? Is status color used consistently and never alone (no color-only signal)?
2. **Font audit** — any forbidden generic fonts? Is body text large enough to read at arm's length outdoors?
3. **Icon audit** — any emoji icons? Single consistent icon library?
4. **Touch-target audit** — is every critical action sized for a gloved thumb, not a mouse pointer?
5. **Offline/sync audit** — does every data screen have a defined offline and syncing/queued appearance?
6. **Grid audit** — creative license spent on brand/orientation screens, and a predictable, low-surprise grid on working screens (not the reverse)?
7. **Spec compliance** — was the Design Specification output before code, and does the code match the declared direction?

**If any audit fails, fix it before handing off the design.**

---

The bar here isn't "looks like a nice app" — it's "a technician can act on this one-handed, in bad light, with patchy signal, without slowing down." Distinctiveness and field usability aren't in tension: a screen genuinely built for the job site will look and feel different from a generic office SaaS screen almost by necessity.
