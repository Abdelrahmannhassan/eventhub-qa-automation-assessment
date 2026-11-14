# ADR 0004 — Authorization is owned by the framework, never by a test

**Status:** Accepted (Phase 1) · **implemented in Phase 6a**.

## Context

The brief is explicit: _"Authorization must be handled by the framework, not by
individual tests."_ The failure mode it guards against is familiar — every spec
starting with a login, logging in dozens of times per run, credentials sprinkled
through test files, and an auth change breaking every test at once.

## Decision

A single component, `AuthManager` (`src/auth/`), is the only thing in the
codebase that exchanges credentials for a session. Everything else consumes the
_result_.

**Flow:**

1. A Playwright **`setup` project** (`tests/setup/auth.setup.ts`) runs once per
   execution, before all other projects via `dependencies: ['setup']`.
2. It asks `AuthManager` for a session and persists it as artifacts under
   `.auth/` (git-ignored).
3. **UI projects** consume it declaratively through
   `use: { storageState: USER_STORAGE_STATE }` — every UI test opens the browser
   already signed in, with _zero_ auth code in the test.
4. **API tests** receive a pre-authenticated request context from a fixture that
   injects the `Authorization` header centrally, so no test ever handles a token.
5. A test that genuinely needs to be unauthenticated (negative auth cases) opts
   out **explicitly and visibly** with
   `test.use({ storageState: ANONYMOUS_STORAGE_STATE })`.

Credentials reach `AuthManager` only through the validated config object
(ADR 0006), and the logger redacts tokens and passwords (`src/core/logger.ts`).
The accounts themselves are disposable and uniquely credentialled, because the
session they produce can surface in test artifacts (ADR 0007).

## Refinement made during implementation

The Phase 1 design had the **`setup` project** produce the session artifact that
UI projects consume via `use: { storageState }`. Implementation showed that this
cannot work alongside per-worker accounts (ADR 0008), for a concrete reason:
**`storageState` is a _test-scoped_ Playwright option**, so a value written once
by a project cannot vary per worker.

So the responsibility split moved:

- The **`setup` project** became a **preflight**: it asserts the API is reachable
  and that _every pooled account_ can authenticate. Its value is fail-fast
  diagnosis — one clearly named failure instead of 32 confusing ones when a
  credential is wrong.
- A **worker-scoped fixture** acquires the session (one sign-in per worker) and
  writes `.auth/worker-<index>.json`. A test-scoped `storageState` fixture then
  derives from it, which is the only way the option can vary by worker.

This is Playwright's documented pattern for authenticating multiple roles in
parallel, and it keeps the ADR's actual requirement intact: **no test logs in.**

## Alternatives considered

**`beforeEach` login in a base spec.** Works, but performs a full login per
test: slow, and it hammers a shared public environment. Rejected.

**`globalSetup` function instead of a setup project.** Loses the Playwright
trace/report for the auth step, and cannot use fixtures. The setup-project
pattern is the current Playwright-recommended approach and is observable in the
report when it fails — which matters, because a broken login should be
diagnosable in one glance, not inferred from 40 downstream failures.

**One shared pre-created account for everything.** Simple, but tests then
contend for the same bookings list and parallelism becomes unsafe. The likely
Phase 2 outcome is _self-registering accounts per worker_, giving isolation on a
shared environment. This is recorded as an intention, not a conclusion — Phase 2
will confirm what the application actually supports.

## Consequences

Good: one login per run instead of one per test; one file to change when auth
changes; no credentials in test code; unauthenticated tests are self-documenting.

Bad / accepted: a session acquired once can expire during a long run (mitigation:
re-acquire on 401 inside `AuthManager`, decided in Phase 6 once token lifetime is
known); and the `setup` project becomes a single point of failure for the whole
suite — acceptable, because that is precisely where such a failure _should_
surface.

## Open questions answered in Phase 2

- Is authentication cookie/session-based, JWT bearer, or both?
- Does registration require email verification? (If so, per-worker accounts are
  not viable and we fall back to a seeded shared account.)
- What is the token lifetime, and is there a refresh mechanism?
- Does `POST /api/bookings` require authentication at all, or can a _visitor_
  (per the user story) book anonymously? This materially affects AC5.
