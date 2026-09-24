# Current handoff

## Active objective

Apply the Stitch "Warm Editorial Finance" redesign to the application shell and the four core
routes. This is a presentation-layer track opened at the owner's request; it temporarily
displaces the automation-rules work recorded below, which is still the next functional step
once the redesign is VERIFIED.

### Request

Stitch project `projects/18092185975379701051` ("Budget App Design System") holds one design
system, **Warm Editorial Finance** (`assets/8325dab44e3746b4944039d3075d73fc`, v1), and four
usable desktop screens. Map them onto our routes:

- Monthly Budget Dashboard -> `/budget`
- Accounts Overview & Net Worth -> `/accounts`
- Goals & Targets Manager -> `/goals`
- Debt Payoff & Strategy Dashboard -> `/debt`

The mobile "Monthly Budget Dashboard" export is byte-identical to the desktop one, so there is
no separate mobile markup to work from; responsive behaviour follows the design system's stated
breakpoints, not a second export.

### Owner decisions (do not re-litigate)

1. **Full Tailwind utilities.** Styling moves to Tailwind v4 utilities driven by the Stitch
   tokens. The semantic rules in `globals.css` are retired as they are replaced.
2. **Dark mode is kept.** Warm Editorial Finance is light-only, so the dark palette is *our*
   derivation, not Stitch-authoritative. Say so in any future design-system round trip.
3. **Restyle existing features only.** Stitch panels with no backing data (amortization
   schedule, target-completion heatmap, net-worth sparkline, inline calculator inputs,
   collapsible category groups) are omitted, not stubbed and not built.

### Acceptance criteria

- `npm run check` passes.
- `APP_BASE_PATH=/mynab npm run test:e2e` passes all 42 desktop/mobile specs **unmodified**.
- No change to any `FinanceForm` `command` shape, `name` attribute, or `<label>` text.
- No `src/domain`, `src/application`, `prisma/` or API-route changes. This track is
  presentation only.
- CSP is not widened. `font-src 'self'` holds, so fonts are self-hosted through
  `next/font/google`; no Google Fonts or Material Symbols CDN link.

### Constraints discovered, and how they are handled

- **e2e selectors are partly structural.** `tests/e2e/finance.spec.ts` asserts on
  `.register-row`, `.finance-form`, `.finance-panel`, `div.finance-panel`, `aside`, `article`
  filtered by text, and `details > summary` disclosure behaviour.
  **Handling:** those class names are retained as bare *marker* classes carrying no CSS; all
  visual styling is expressed in utilities beside them. Element choices (`aside`, `article`,
  `details`/`summary`) are preserved. The tests are not to be rewritten.
- **`#main` and `.skip-link`** are asserted by `tests/e2e/foundation.spec.ts:134`. The skip link,
  the `#main` id and its `tabIndex={-1}` stay exactly as they are.
- **Dark theme** is asserted at `tests/e2e/foundation.spec.ts:104` via `data-theme` on `<html>`.
  Keep `ThemeToggle`, the `mynab-theme` cookie and the server-rendered attribute untouched.
- **Icons:** keep `lucide-react` (inline SVG, already a dependency) and map each Material Symbol
  in the Stitch export to its Lucide equivalent. Do not self-host an icon font.

### Markup contract the e2e suite depends on

Extracted from `tests/e2e/` before Step 2. Breaking any of it breaks tests that are not to
be rewritten, so treat it as the boundary of what the restyle may change.

- `panel(page, heading)` resolves to a **`<section>` or `<details>`** containing an exact
  heading. These headings must keep both their wrapper element and their exact text:
  Add a category · Add a category group · Add an account · Categories without a target ·
  Create a schedule · Fund every target · Manage schedules · Possible recurring transactions ·
  Record a transaction · Record the terms · Recorded terms · Set a target · What you owe.
- Other exact headings asserted directly: Bring your accounts in. · Card · Match income ·
  Needs review (0) · Revised income.
- Page `<h1>` text, asserted per route: "Give your money a purpose." (budget) ·
  "See the whole picture." (accounts) · "Make space for what's ahead." (goals) ·
  "Find your way forward." (debt).
- Marker classes, kept with no CSS attached: `.register-row` (and its direct `> summary`),
  `.finance-form`, `.finance-panel` — the last also matched as `div.finance-panel` nested
  inside the "Manage schedules" panel, so it must stay a `div` there.
- `<article>` is the element for summary cards, matched by text: "Ready to Assign",
  "Current balance", and a schedule occurrence by its payee.
- `<aside>` carries the "You have assigned more than you have" overspend notice on goals.
- Exact link names: "Manage bank connections", "Next →".
- `#main` with `tabIndex={-1}` on every route, and the skip link first in tab order.
- Exactly one element in the accessibility tree per accessible name, at **both** the 1440px
  and 390px viewports. This is why sign-out and the theme toggle live only in the top bar.

### Plan

- **Step 0 — tokens and fonts.** `globals.css` rewritten as Tailwind v4 `@theme inline` over
  CSS custom properties, so `[data-theme="dark"]` re-points the same utilities. Newsreader and
  Plus Jakarta Sans wired through `next/font/google` in `src/app/layout.tsx`.
- **Step 1 — shell.** `src/app/(protected)/layout.tsx`, `navigation.tsx`, `brand.tsx`,
  `theme-toggle.tsx` to the Stitch 256px rail + fixed 64px top bar.
- **Step 2 — routes, one at a time, each with `npm run check` before moving on:** `/budget`,
  `/accounts`, `/goals`, `/debt`.
- **Step 3 — forms.** Restyle `finance-form.tsx` / `finance-fields.tsx` wrappers only; verify
  payload parity, then run the full e2e suite.

### Status

- Step 0 — IN PROGRESS. Files: `src/app/globals.css`, `src/app/layout.tsx`.
- Step 1 — PLANNED.
- Step 2 — PLANNED.
- Step 3 — PLANNED.

Baseline checkpoint before any redesign edit: `20260924T014838Z`
("pre-stitch-redesign baseline"), taken on top of the schedules work described below.

## VERIFIED increment, unreleased

Schedule future-version edits, optimistic revisions, history retention and explicit matching
to existing transactions. Match adds no journal; one transaction cannot handle multiple
occurrences. Archived history is visible; corrected links remain handled with a notice.
Recurring suggestions now have evidence and editable owner-reviewed creation. Pure rule
preview engine is implemented/tested but not persisted or exposed in application UI yet.

13 migrations through 202609240002_schedule_revisions. No production changes or image build.

Verification commands: npm run check (164 unit/property, lint/typecheck),
npm run test:integration (68),
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build,
APP_BASE_PATH=/mynab npm run test:e2e (42 desktop/mobile),
PG_BIN=/opt/homebrew/opt/postgresql@17/bin npm run test:backup (29 tables).
Fresh mynab_schedule_revisions_empty_test: all 13 migrations, 35 composite ownership FKs.

## Next action

Finish the redesign steps above. Then resume the deferred functional track: persist automation
rules and add rule CRUD/order/enable/preview/application UI with ownership, audit, idempotency
and protected manual fields, using `src/domain/rules.ts` semantics. Then finish Phase 4 gaps and
proceed through every remaining phase listed in NEXT_STEPS.md. Do not count pure rule previews
as implemented saved rules. Schedule timezone eligibility currently follows the budget timezone;
explicit tests and behavior refinement remain.

## Operational boundary

Prior handoff reports deployed 0.3.5 with owner-authorized demo data; PNC was removed by
seeding. Production was not accessed. Never reset/reseed it or print secret files. New schema
requires new versioned images; no overwrite of deployed tags. Use the capped Linux builder
at release gates, back up and preserve encryption keys. Full Portainer YAML, re-pull off.
