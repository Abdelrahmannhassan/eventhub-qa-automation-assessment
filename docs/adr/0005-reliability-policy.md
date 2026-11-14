# ADR 0005 — Reliability policy: zero retries, no hardcoded waits, enforced by lint

**Status:** Accepted (Phase 1)

## Context

The quickest way to a green pipeline is also the most corrosive: add a retry,
add a `waitForTimeout`, skip the awkward test, wrap the assertion in an `if`. The
suite goes green and stops carrying information. A framework meant to live for
years has to make that path inconvenient.

## Decision

**`retries: 0`** in every environment, including CI.

A retry turns a real signal into noise: either the test is wrong (fix the test)
or the product is unstable (report the defect). Retrying hides both. We would
rather own a red pipeline we can explain.

Supporting rules, **mechanically enforced** by ESLint on `tests/**` so they
cannot be forgotten in review:

| Rule                                      | Prevents                                              |
| ----------------------------------------- | ----------------------------------------------------- |
| `playwright/no-wait-for-timeout`          | sleeping instead of waiting for a condition           |
| `playwright/no-skipped-test`              | quietly parking a failing test                        |
| `playwright/no-conditional-in-test`       | branching that makes a test pass without checking     |
| `playwright/no-conditional-expect`        | assertions that may never execute                     |
| `playwright/expect-expect`                | a "test" that asserts nothing                         |
| `playwright/no-force-option`              | `force: true` masking a genuinely unclickable element |
| `@typescript-eslint/no-floating-promises` | an un-awaited action — the classic phantom pass       |

Instead of waits we rely on Playwright's web-first assertions and
auto-waiting locators. Instead of retries we rely on **test isolation**: unique
data per test (ADR 0002) so parallel execution cannot be the cause of flakiness.

On failure we keep `trace`, `screenshot` and `video` (`retain-on-failure`), so a
single CI failure is diagnosable without reproducing it locally.

## The one retry that exists, and why it is not a contradiction

`ResourceTracker` retries each **cleanup** operation once.

This cannot make an assertion pass: teardown runs after the verdict is already
decided. It was added because the shared environment produced a genuine transient
`ECONNRESET` on a `DELETE` during Phase 6a, and an undeleted booking is litter on
a server we do not own. A failure after the retry is still reported through a
test annotation, never swallowed.

The distinction to hold onto: **retrying a test hides information; retrying a
delete reduces litter.** Only the former is banned here.

## Alternatives considered

**`retries: 1` on CI only** — the common industry default. It is defensible for
suites running against genuinely flaky third-party infrastructure, and EventHub
_is_ a shared public environment, so this may become justified. We are starting
at zero deliberately: we want to _measure_ instability before masking it. If
Phase 6/7 produces evidence of infrastructure-level flakiness, we will revisit
this ADR with that evidence and document the retry as a known compensation —
never as a silent default.

## Consequences

Good: every failure means something; flakiness surfaces immediately rather than
accumulating.

Bad / accepted: a transient network blip on a public environment will fail the
pipeline. We consider a false red cheaper than a false green.
