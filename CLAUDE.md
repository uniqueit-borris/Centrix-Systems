# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MSP SLA Calculator for Centrix Systems — a static, client-side-only web app (no build step, no dependencies, no package manager). Open `index.html` directly in a browser or serve the directory with any static file server to run it.

There is no test suite, linter, or build tooling in this repo. Verify changes by opening the app in a browser and exercising the relevant tab.

## Architecture

The app has **two parallel copies** that must be kept in sync:

- `index.html` + `styles.css` + `app.js` — the split, multi-file version.
- `centrix-sla-calculator.html` — a single self-contained file with the same CSS and JS inlined via `<style>`/`<script>` tags, meant as a standalone deliverable (e.g. to hand to a client).

**When changing app behavior or styling, update both copies.** There is no build step that generates one from the other — edits must be duplicated manually.

### `app.js` structure

All logic lives in one file, organized by feature section (see the banner comments):

- `DEFAULT_TIERS` / `COVERAGE` — the two core config objects. `DEFAULT_TIERS` defines the four SLA priority levels (p1–p4) with response/resolution/escalation targets (hours) and compliance goals (%). `COVERAGE` defines the three support-hour windows (24/7, business hours, extended).
- Tier state (`tiers`) is persisted to `localStorage` under the key `centrix_tiers` (`loadTiers`/`saveTiers`), so a tier edit on the "SLA Tiers" tab affects deadline and compliance calculations elsewhere in the same browser.
- Business-hours math (`addBusinessHours`, `snapToBusinessHours`, `elapsedBusinessMinutes`) computes deadlines/elapsed time honoring the selected coverage window's days and hours — this is the trickiest part of the codebase; changes here affect every tab.
- The four tabs (Deadline Calculator, Compliance Tracker, Uptime Calculator, SLA Tiers) are independent UI sections in the HTML, switched via `.tab-btn`/`.tab-content` classes, but Deadline/Compliance/Tiers all share the same `tiers` array.
- Ticket log and compliance/uptime results are computed and re-rendered into the DOM on each button click; there is no framework or virtual DOM — result panels are rebuilt via template strings and `innerHTML`.
- `escHtml` is used when interpolating user-provided strings (ticket ID, etc.) into `innerHTML` — keep using it for any new user input rendered this way to avoid XSS.

## Other

- `projects/` contains planning docs (e.g. `projects/centrix-test-sla/README.md`) unrelated to the calculator's code — treat these as project/business documentation, not app source.
