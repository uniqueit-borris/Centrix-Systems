# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

This repo hosts the **Centrix Systems MSP SLA Calculator** — a static, client-side web app with no build system, package manager, or backend. There is no `package.json`, no bundler, and no test runner. Everything runs directly in the browser from plain HTML/CSS/JS files.

## Files

- `index.html` — main app markup (multi-tab layout). Loads `styles.css` and `app.js` as separate files.
- `styles.css` — all styling for `index.html` (CSS custom properties for colors/theming, no preprocessor).
- `app.js` — all application logic for `index.html` (vanilla JS, no framework, no modules/imports).
- `centrix-sla-calculator.html` — a **standalone single-file bundle**: the same app with `styles.css` inlined in a `<style>` block and `app.js` inlined in a `<script>` block. Exists so the tool can be downloaded and run by a client without any other files.
- `projects/centrix-test-sla/README.md` — planning notes for a separate/future SLA project workspace (scope, assumptions, task list). Not app code.

### Keeping the two versions in sync

`index.html` + `styles.css` + `app.js` and `centrix-sla-calculator.html` implement the **same app twice**. Whenever you change one, mirror the change in the other:
- Edit logic in `app.js`, then copy the updated script body into the `<script>` block of `centrix-sla-calculator.html`.
- Edit `styles.css`, then copy the updated CSS into the `<style>` block of `centrix-sla-calculator.html`.
- Edit markup/structure in `index.html`, then apply the equivalent DOM changes inside `centrix-sla-calculator.html`'s `<body>`.

There is no build step that generates one from the other — synchronization is manual, so double-check both files are consistent before committing.

## Development workflow

There is no install, build, lint, or test command — this is plain static HTML/CSS/JS.

- **Run/preview:** open `index.html` (or `centrix-sla-calculator.html`) directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`) if `file://` restrictions cause issues.
- **Verify changes:** manually exercise the app in a browser — click through all four tabs and confirm calculations look correct. There is no automated test suite.

## Architecture (app.js)

The app is a single-page, tab-based tool with four sections, all driven by one script attached via direct DOM queries (`document.getElementById`/`querySelectorAll`) and inline event listeners — no component framework, no routing.

- **Tab navigation** — `.tab-btn` buttons toggle `.active` class on themselves and the matching `.tab-content` section (`data-tab` ↔ `#tab-{value}`).
- **SLA tier config** (`DEFAULT_TIERS`) — defines response/resolution/escalation targets and compliance goals per priority (P1–P4). User edits are persisted to `localStorage` under `centrix_tiers` (`loadTiers`/`saveTiers`) and override the defaults on load; all four calculators read from the live `tiers` array, so tier edits immediately affect other tabs.
- **Business hours engine** (`COVERAGE`, `addBusinessHours`, `snapToBusinessHours`, `elapsedBusinessMinutes`) — the core shared logic. Three coverage profiles (24/7, business hours, extended hours) define which days/hours count as "business time." All deadline and elapsed-time math walks day-by-day through this calendar rather than doing naive datetime arithmetic — respect this when modifying deadline calculations, since a straightforward `Date` addition would ignore non-business hours/days.
- **Deadline Calculator tab** — computes response/escalation/resolution deadlines from a ticket's received time + priority + coverage, compares against actual responded/resolved times to mark `met`/`breach`/`pending`, and appends results to an in-memory `ticketLog` (not persisted — cleared on reload or via "Clear All").
- **Compliance Tracker tab** — pure client-side aggregation of user-entered totals/met counts per priority tier against each tier's `complianceGoal`; breach count is derived (`total - met`), not user-entered.
- **Uptime Calculator tab** — two independent calculators: allowed downtime from an SLA % target, and actual uptime % from a downtime figure; plus a static reference table generated from fixed period-hour constants (`PERIOD_HOURS`).
- **SLA Tiers tab** — editable table view over the same `tiers` array used everywhere else; "Save" persists to `localStorage`, "Reset" restores `DEFAULT_TIERS`.

All HTML injected via template literals for dynamic content (ticket IDs, log entries) is escaped through `escHtml()` — keep using it for any new user-supplied text inserted into `innerHTML` to avoid introducing XSS.
