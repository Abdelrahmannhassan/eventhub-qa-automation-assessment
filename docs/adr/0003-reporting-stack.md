# ADR 0003 — Reporting: Playwright HTML + JUnit + Allure Report 3 (Node, no Java)

**Status:** Accepted (Phase 1) · **Revised in Phase 1 hardening** — switched from
the Java-based Allure 2 toolchain to Allure Report 3, which is pure Node.

## Context

CI must "make the test report available". Three audiences want different things:
an engineer debugging a failure, a reviewer checking that acceptance criteria are
covered, and a team watching stability over time. Allure was proposed; the brief
asked us to evaluate its suitability rather than adopt it reflexively.

The original Phase 1 decision adopted Allure but recorded its **Java dependency**
as the main cost: Allure 2 renders reports via `allure-commandline`, a wrapper
around a JVM tool. That cost has since disappeared.

## Decision

Run three reporters, each for a distinct job:

1. **Playwright HTML** (`playwright-report/`) — the debugging report. Trace,
   video, screenshots, step timeline. Zero extra tooling. Nothing debugs a
   Playwright failure as well, and Allure cannot replace it because it does not
   render Playwright traces.
2. **JUnit XML** (`test-results/junit.xml`) — machine-readable feed for CI
   summaries and any future test-management integration.
3. **Allure Report 3** (`allure-results/` → `allure-report/`) — the stakeholder
   report: requirement traceability and cross-run history.

### Verified: Allure 3 is stable and needs no Java

Checked against the npm registry on 2026-11-14, not assumed:

| Check                  | Result                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| First stable `3.0.0`   | 2025-12-22 — ~11 months in general availability                                       |
| Stable 3.x releases    | 39 (latest `3.33.0`, 2026-11-05) — actively maintained                                |
| Dependency tree        | Entirely `@allurereport/*` Node packages; **no `allure-commandline`, no JVM wrapper** |
| Practical verification | `allure generate` produced a working report locally, with no Java on the PATH         |

**Verdict: switch.** This removes the single real drawback recorded in the
original ADR. CI no longer needs a `setup-java` step, and the report generator is
installed by the same `npm ci` that installs everything else — one toolchain
instead of two.

Allure 3 also adds `allure awesome --single-file`, which emits the whole report
as **one self-contained `index.html`**. That is a materially better CI artifact
than a directory of hashed JS chunks, so it is wired as `npm run allure:single`.

**Pinned to `allure@3.22.1`.** Versions from `3.23` onward declare
`engines: node >= 22.18.0`, and this project's Node is `22.14.0` (`.nvmrc`).
Pinning keeps local and CI byte-identical (ADR: reproducible installs via
`npm ci` + `save-exact`). Upgrading Allure is a deliberate, paired change:
bump `.nvmrc` to ≥ 22.18 **and** the `allure` pin together.

### Why Allure earns its place at all

- **Traceability.** Allure labels (`epic` / `feature` / `story` / `severity`) let
  us tag each test with US-114 and the specific acceptance criterion it covers,
  so the report itself answers _"is AC2 tested?"_ — exactly what a reviewer or a
  Product Owner wants to see.
- **History.** Allure keeps results across runs, surfacing flakiness and trends.
  The Playwright HTML report is per-run only.

### What Allure still cannot do

- It does not render Playwright traces, so reporter #1 stays.
- History only works if previous results are **persisted** between runs (e.g. a
  `gh-pages` branch) — additional CI wiring, decided in Phase 7.

## Alternatives considered

**Allure 2 + `allure-commandline` (the original decision).** Rejected now that
Allure 3 is stable: it would add a JRE to CI for no functional gain.

**Playwright HTML only.** Simplest. Rejected because it gives no AC traceability
and no cross-run history — the two things a long-lived suite needs most.

**Monocart reporter.** Genuinely good and Java-free. Rejected mainly on
ubiquity: Allure is the de-facto standard a QA team and an interviewer will
recognise, and the brief named it. With Allure 3 removing the Java cost,
Monocart's main advantage over Allure 2 no longer applies.

**ReportPortal.** Needs a hosted server — disproportionate here.

## Consequences

Good: each audience is served; AC coverage becomes visible rather than asserted
in prose; **one toolchain** (Node only); a single-file HTML artifact for CI.

Bad / accepted: three reporters produce three output directories; a stale
`allure-results/` can confuse a local run (hence `npm run clean`); and the Allure
pin is coupled to the Node version, so upgrades must move together.

**Low lock-in, by design:** Allure is one reporter entry plus one CI step. If it
stops being worth it, removing it is a two-line change and the suite keeps working.
