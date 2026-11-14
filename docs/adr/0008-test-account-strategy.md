# ADR 0008 — Test account strategy: a fixed pool, not per-run registration

**Status:** Accepted as a design (Phase 4). Implementation in Phase 6.

## Context

Tests need authenticated accounts, and the framework must supply them (ADR 0004).
EventHub is a **shared public practice environment** used by other candidates at
the same time, and the brief asks us to clean up data we create.

Two facts from Phase 2 decide this:

- `POST /auth/register` is instant and needs **no email verification** — accounts
  are trivially cheap to create.
- **There is no endpoint to delete an account.** Bookings and user-created events
  can both be deleted; accounts cannot. Anything we register is permanent.

## Options

### (a) Self-register a new account per worker, every run

|          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Good** | Perfect isolation — a fresh account has an empty `My Bookings`, so even count-based assertions are safe. No account secrets to manage. Scales to any worker count automatically; no pool to exhaust. A new contributor runs `npm test` with zero credentials. Two concurrent runs can never collide.                                                                                                                                                                                                          |
| **Bad**  | **Every run leaves permanent accounts behind, and they cannot be deleted.** Two CI workers × a few pushes a day × a team × two years is thousands of orphan rows on someone else's server — the opposite of "clean up any data you create". The whole run also becomes dependent on `/auth/register` staying available and unthrottled (rate limiting was deliberately not probed). And because passwords exist only in memory, you cannot log in afterwards to inspect the state a failing test left behind. |

### (b) Fixed pool of pre-created accounts, supplied as secrets

|          |                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Good** | **Creates nothing per run** — the account footprint is fixed and tiny. Credentials rotate in one place. A human can sign in as the exact account a test used and inspect what happened, which matters when CI fails and local passes.                                                                                                                                                     |
| **Bad**  | Pool size caps parallelism, so worker→account mapping and exhaustion handling are needed. State **persists between runs**: a crashed run can leave bookings behind. Two concurrent runs (CI on two branches, or CI plus a laptop) share the same accounts and therefore see each other's bookings. More secrets to manage, and a new contributor needs them before their first local run. |

## Decision

**Option (b): a fixed pool of pre-created accounts.**

The deciding argument is asymmetry of harm. Option (b)'s weaknesses are
**mitigable by test design we want anyway**; option (a)'s central weakness is
**not mitigable at all**, because the API offers no way to delete an account.

How (b)'s drawbacks are handled:

| Drawback                           | Mitigation                                                                                                                                                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leftover state between runs        | Every test creates its own event and registers every resource with `ResourceTracker`; teardown removes them. `DELETE /bookings` (bulk) exists as a documented fallback.                                                                             |
| Concurrent runs sharing an account | **Presence-based assertions only** — assert "my booking reference is in the list", never "the list has one item". This is correct practice on any shared environment, so it costs nothing. Each test's own event keeps seat arithmetic independent. |
| Pool caps parallelism              | Pool is sized to the CI worker cap (2) and assigned by Playwright's worker index. Raising concurrency means adding an account and a secret — a known, cheap step.                                                                                   |
| Contributor onboarding friction    | Option (a) stays available as an explicit, documented **fallback mode** for contributors without secrets. It is opt-in, never the default, so nobody litters by accident.                                                                           |

### Pool shape

| Role                | Count                    | Purpose                                                                                                                                                      |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Worker accounts** | one per worker (2 in CI) | The acting user. Assigned by worker index, so two workers never share one.                                                                                   |
| **Foreign account** | 1, shared                | Used _only_ to attempt unauthorized reads and cancels (expecting `403`/`404`). It **creates nothing**, so sharing it across workers is safe by construction. |

Three accounts total. Two already exist from Phase 2 exploration.

Separating the "foreign" role is what keeps the authorization tests from
contending with the worker accounts — a single pool where the isolation test
borrowed another worker's account would reintroduce exactly the interference
option (b) is supposed to avoid.

## Consequences

Good: a fixed, tiny footprint on a shared environment; failures are reproducible
against a known account; assertion style that is robust to concurrent runs.

Bad / accepted: secrets must exist before CI can run (Phase 7), local onboarding
needs either the secrets or the fallback mode, and raising worker count is a
deliberate two-step change rather than automatic.

**Interview note:** the useful framing is that the usual textbook answer is (a) —
"always create fresh data" — and it is the right answer _when you can delete what
you create_. Here you cannot delete accounts, so "fresh every run" quietly means
"leak forever on a server you do not own". Recognising that the cleanup
asymmetry, not the isolation theory, is the deciding factor is the whole point.
