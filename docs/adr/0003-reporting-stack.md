# ADR 0003 — Reporting: Playwright HTML + JUnit + Allure

**Status:** Accepted (Phase 1) · to be validated in CI during Phase 7

## Context

CI must "make the test report available". Three different audiences want
different things: an engineer debugging a failure, a reviewer checking that
acceptance criteria are covered, and a team watching stability over time.
Allure was proposed; the brief asked us to evaluate its suitability rather than
adopt it reflexively.

## Decision

Run three reporters, each for a distinct job:

1. **Playwright HTML** (`playwright-report/`) — the debugging report. Ships
   trace, video, screenshots and a step timeline. Zero extra tooling. Nothing
   else debugs a Playwright failure as well.
2. **JUnit XML** (`test-results/junit.xml`) — the machine-readable feed for CI
   summaries and any future test-management integration.
3. **Allure** (`allure-results/` → `allure-report/`) — the stakeholder report:
   requirement traceability and trends.

### Why Allure earns its place

The deciding factor is **traceability and history**, which the built-in report
does not provide:

- Allure labels (`epic` / `feature` / `story` / `severity`) let us tag each test
  with US-114 and the specific acceptance criterion it covers, so the report
  itself answers _"is AC2 tested?"_ — exactly what a reviewer of this assessment,
  or a Product Owner, wants to see.
- Allure keeps **history across runs**, surfacing flakiness and trends. The
  Playwright HTML report is per-run only.

### Why Allure is _not_ enough on its own

- It needs a **JRE plus the Allure CLI** to turn results into a report — a real
  CI dependency, and the main cost of this decision.
- Report generation is a **second step** (`allure-results` → `allure-report`).
- History only works if previous results are **persisted** between runs (e.g. a
  `gh-pages` branch), which is additional CI wiring.
- It does **not** render Playwright traces, so it cannot replace reporter #1.

## Alternatives considered

**Playwright HTML only.** Simplest, no Java. Rejected because it gives no AC
traceability and no cross-run history — the two things a long-lived suite needs
most.

**Monocart reporter.** Genuinely good, no Java, richer than built-in HTML.
Rejected mainly on ubiquity: Allure is the de-facto standard a QA team and an
interviewer will recognise, and the brief named it.

**ReportPortal.** Needs a hosted server — disproportionate here.

## Consequences

Good: each audience is served; AC coverage becomes visible rather than asserted
in prose.

Bad / accepted: three reporters produce three output directories, CI needs Java
for the Allure step, and a stale `allure-results/` can confuse a local run (hence
`npm run clean`).

**Low lock-in, by design:** Allure is one reporter entry plus one CI step. If
Phase 7 shows it is not worth the Java dependency, removing it is a two-line
change and the suite keeps working.
