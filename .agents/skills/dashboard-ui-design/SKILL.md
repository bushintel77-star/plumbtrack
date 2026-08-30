---
name: dashboard-ui-design
description: Use when designing or prototyping a desk-based dashboard, admin panel, dispatcher/ops console, internal tool, or SaaS-style web app — anything with data panels, status boards, schedules, metrics, or management views for someone sitting at a desk rather than working in the field. This is the desktop/office counterpart to mobile-fsm-ui-design. Trigger this even if the user doesn't say "dashboard" explicitly — "admin panel," "back office," "ops console," "internal tool," "control panel," and "management screen" all qualify. Unlike more timeless UI skills, dashboard design trends genuinely shift year to year, so this skill's first step is always a fresh web search — treat the reference material below as a dated starting point, not the final word.
---

# Dashboard UI Design

The desk-based counterpart to `mobile-fsm-ui-design`: dashboards, admin panels, dispatcher/ops consoles, and other desktop management surfaces. Where the mobile skill is built around durable field constraints (glare, gloves, offline), this domain moves fast — what counts as current dashboard design shifts meaningfully year to year. So this skill leads with research, not fixed rules.

## Activation Contract

### Use this first when
- The request is to decide visual direction, produce a design spec, or prototype screens for a desk-based dashboard, admin panel, ops/dispatcher console, or internal tool.
- Layout, density, and information-hierarchy choices need to be made before implementation.

### Then also read
- `mobile-fsm-ui-design`, if this product also has a field/mobile side — keep them as two purpose-built products (different device, different density, different urgency), not one layout ported down.
- Your project's frontend implementation skill once the design spec is set.

### Do NOT use for
- The mobile/field-worker side of a product (use `mobile-fsm-ui-design`).
- Marketing sites, landing pages, or brand/portfolio pages (use `frontend-design` directly — its general design process still applies here too, just layered under this skill's domain specifics).

---

## Step one, always: research current trends before deciding anything

Dashboard design is one of the faster-moving corners of UI — "best practice" from two years ago (dense widget grids, generic pastel SaaS blue, decorative gradients) reads as dated now, and what replaces it will keep moving. Don't design from memory or from this file alone. Before writing the design specification, run 3–5 searches such as:

- "dashboard UI design trends [current year]"
- "SaaS dashboard design examples [current year]"
- "admin panel / ops console design trends [current year]"
- something specific to the product's own domain (e.g. "dispatch board UI", "fintech dashboard design", "developer tool dark mode design")

Then apply real judgment to what comes back — see the next section. Don't treat every "2026 trend" article as equally credible.

### Telling a real source from SEO filler

Design-trend content ranges from genuinely reasoned to keyword-stuffed filler written to rank, not to inform. Learn to tell them apart quickly:

**Trust more:** sources that name specific real products and explain *why* a pattern works for them, acknowledge trade-offs or when a pattern doesn't apply, and reason from usage pattern rather than asserting a universal rule. ("Dark mode is a primary surface for developer and monitoring tools built around long sessions — for lighter-use CRMs and project tools it's a nice-to-have, not critical" is reasoned. "Dark mode is the default now, not the bonus" with no elaboration is not.)

**Trust less:** generic buzzword bullet lists with no elaboration ("AI integration, dark mode, mobile-first, real-time data"), heavy repetition of the target keyword and year for SEO, unrelated location/city name-dropping, and blanket claims stated with no conditions attached. This content isn't necessarily *wrong*, but it's not worth updating a design decision on its word alone — cross-check it against a source that actually reasons.

When two sources conflict, prefer the one that explains its reasoning over the one that just asserts.

---

## Reference: durable findings from a research pass in August 2026

This is a dated snapshot, kept as a useful starting point — not a substitute for the fresh search above, since some of it will have aged by the time you're reading this. Sources judged higher-trust in that pass: pixelmatters.com/insights (reasons from named real products — Apple, Arc, Chanel), 925studios.co/blog (deep, specific, named-product analysis — Stripe, Linear, Datadog, Mercury — with explicit "what to borrow" per example). Judged lower-trust: asappstudio.com and similar agency SEO posts (keyword-stuffed, city-padded, asserts trends without reasoning) — glance for buzzword awareness only, never treat as the deciding source.

Findings that showed up across multiple independent, reasoned sources:

- **A "north star" answer, sized to be seen in under two seconds.** The strongest pattern across serious SaaS dashboards (Stripe, Baremetrics, Vercel) is one dominant number or status — sized noticeably larger than supporting metrics — placed where the eye lands first, answering "is everything okay?" before the user has to dig.
- **Progressive disclosure.** Show 5–9 elements on the default view; everything else sits behind a tab or drill-down. Density signals unfinished thinking now, not power.
- **Color is strictly functional, never decorative.** Status color means something specific and consistent; it doesn't compete with brand color or gradients.
- **Spatial/depth layering communicates hierarchy on flat screens.** Elevation, overlap, frosted/glass surfaces — used to show what's primary vs. secondary without extra explanation. (Apple's own "Liquid Glass" language is one current name for this; the useful part is the layering logic, not the literal blur effect.)
- **Motion communicates state and intent, not just decoration.** A drop target that visibly responds to a drag communicates the action is possible; a queued state that visibly differs from a confirmed one prevents false confidence.
- **Dark mode is validated specifically for developer, monitoring, and long-session tools** — not a blanket rule. CRM, ops, and project-management-style tools remain a legitimate light-theme choice; the deciding factor is session length and usage pattern, not "what year it is."
- **AI-native framing means prioritizing and ranking what already exists**, not a bolted-on chat box. The pattern worth borrowing is surfacing what needs attention before the user has to notice it themselves — not a literal assistant UI.
- **Typography scale and weight carry hierarchy here too, not just color.** If this product already has a mobile side with a validated type scale and font pairing (see `mobile-fsm-ui-design`'s Typography section, if this project has that skill), reuse the same fonts rather than inventing a parallel system for the desktop surface — two unrelated type systems in one product reads as two products. Two findings from that research carry over directly regardless of device: a condensed or industrial display face stays legible only at large sizes (headers, hero numbers, section titles) — drop to the body face the moment it's read as a phrase or shown small; and any data that updates or needs to align in a column (timestamps, IDs, table figures, live counters) belongs in a monospace or tabular-figure face so digits don't shift width as values change. Desktop body text can run smaller than a mobile floor would allow (13–14px is normal in dense data tables, versus a 16px mobile minimum) since reading distance and context differ — that's a legitimate difference, not an inconsistency to fix.

---

## Design Specification

Before writing interface code, output a short spec: purpose (who's using this, at a desk, doing what job), information density and role (operator/analyst/executive — they need different defaults), the aesthetic direction chosen and why, the color and type system (reuse an existing product's brand system if one exists — don't invent a parallel palette for the desktop side of a product that already has a mobile identity), and the layout shape (panels, canvas, inspector — justified by the actual workflow, not copied from a template).

## Self-Audit Before Submitting

1. Did you actually search for current trends, or design from memory / this file alone?
2. Is there a real "north star" answer visible without opening a panel?
3. Is color functional only — no decorative gradients competing with status meaning?
4. If dark mode was chosen, is it justified by session length/usage pattern — not just "that's the trend"?
5. Does this feel like a purpose-built desk tool for this product, not a generic admin template?
