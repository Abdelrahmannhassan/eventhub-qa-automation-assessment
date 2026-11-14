# ADR 0010 — Known defects report in their own job, they do not gate

**Status:** Accepted (Phase 7)

## Context

Phase 7 found a **High-severity product defect**: `POST /bookings` oversells
under concurrent load. Two concurrent bookings for the last seat can both return
`201`, and the lost decrement leaves `availableSeats` at `0` rather than `-1`
(`api-findings.md` §7b).

The test that detects it asserts the correct thing — _exactly one booking must
succeed_. The product does not satisfy it. Critically, the defect is
**intermittent: it reproduced in 3 of 6 trials**, because the race window only
opens when the host is serving other traffic.

That leaves a pipeline that is red for a true reason, which sounds acceptable
until you notice what it costs: a permanently red pipeline stops being read, and
it can no longer tell you about a **new** regression. The defect would be
masking everything behind it.

## Options

**A. `test.fail()`** — Playwright's known-failure annotation. The test runs, is
expected to fail, and reports an _unexpected pass_ if the product is fixed.

**Rejected, and the reason matters: the defect is intermittent.** `test.fail()`
asserts the test _always_ fails. On the ~50% of runs where the race happens not
to reproduce, Playwright reports an unexpected pass and the run goes **red**. The
annotation would convert a real, understood defect into a flaky test — the exact
failure mode this project refuses elsewhere (ADR 0005).

**B. Leave it failing in the main job.** Maximum honesty. Rejected: a
permanently red gate cannot detect a regression, so the defect's cost grows over
time rather than staying contained.

**C. Quarantine with visibility** — the chosen option.

**D. Delete, skip, weaken or retry the test.** Rejected outright. Each discards
the finding, and `playwright/no-skipped-test` fails the build anyway.

## Decision

The test is tagged **`@known-defect`** and its **assertion is unchanged** — it
still requires exactly one `201`. Two CI jobs then separate the two questions:

| Job                     | Runs                                          | Gates?                             | Answers                                  |
| ----------------------- | --------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| `test` (UI + API suite) | `playwright test --grep-invert @known-defect` | **Yes**                            | "Has anything regressed?"                |
| `known-defects`         | `playwright test --grep @known-defect`        | **No** (`continue-on-error: true`) | "Does the known defect still reproduce?" |

The known-defects job uploads its own report and writes a job summary naming the
defect, its severity, its documentation reference, and whether it reproduced on
this run.

Two details that are easy to get wrong:

- **`needs: test`** is not an ordering preference. Both jobs act as the same
  pooled accounts, so running them in parallel would reintroduce exactly the
  interference the workflow-level `concurrency` lock prevents _between_ runs
  (ADR 0008). `if: always()` keeps the defect reported even when the gate fails.
- **A green known-defects job is not a fix.** Because the defect is
  intermittent, "did not reproduce this run" is not evidence of repair. The job
  summary says so explicitly, so nobody closes the defect on one lucky run.

Locally, `npm test` is the gate and `npm run test:known-defects` runs the
quarantined tests; `npm run test:all` runs everything. The split is identical in
CI and on a laptop.

## Consequences

Good: the gate stays meaningful, so a new regression is still visible; the defect
is reported on **every** run rather than buried in a red pipeline; the assertion
stays correct, so the day the product is fixed the job simply goes green; and the
defect has a durable, reviewable home.

Bad / accepted: `npm test` no longer runs literally every test, which a
contributor could overlook — mitigated by the separate job running on every push,
the job summary, the README defects section and this ADR. The quarantine list
also needs discipline: it must stay short and every entry must have a real
defect reference. A quarantine that grows is a team problem wearing a technical
disguise.

**Exit criterion.** An entry leaves quarantine when the product is fixed and the
test passes consistently — not on a single green run. At that point the tag is
removed and the test rejoins the gate.

**Interview note:** the useful framing is that there are two different questions,
and one pipeline status cannot answer both. "Has anything regressed?" must stay
answerable, which means a known defect cannot sit in the gate. "Is the known
defect still there?" deserves a real answer on every run, which means it cannot
be deleted or skipped either. Splitting the jobs is what lets both stay true, and
rejecting `test.fail()` on the specific grounds of intermittency is the detail
that shows the decision was reasoned rather than copied.
