# Framework architecture

**Design only.** Nothing here is implemented yet — implementation is Phase 6.
Reasoning for each choice lives in [`docs/adr/`](adr/); this page is the map.

## Layers

Two rules hold the whole design together:

- **Assertions live only in `tests/`.**
- **Locators and URLs live only in `src/`.**

```
┌──────────────────────────────────────────────────────────────────────┐
│  tests/            scenario intent + assertions ONLY                 │
│  ├── api/          AC behaviour at the HTTP layer                    │
│  ├── ui/           AC behaviour in the browser                       │
│  └── e2e/          cross-layer (book via API, verify in UI)          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  import { test, expect } from '@fixtures'
┌───────────────────────────────▼──────────────────────────────────────┐
│  src/fixtures/     dependency injection + automatic teardown         │
│                    injects: api clients · page objects · tracker     │
└──────┬──────────────────────┬─────────────────────────┬──────────────┘
       │                      │                         │
┌──────▼───────────┐  ┌───────▼────────────┐  ┌─────────▼────────────┐
│  src/api         │  │  src/ui            │  │  src/data            │
│  ├── clients/    │  │  ├── pages/        │  │  └── factories/      │
│  │   typed HTTP  │  │  │   locators +    │  │      unique, valid-  │
│  │   no asserts  │  │  │   intent actions│  │      by-default      │
│  └── contracts/  │  │  └── components/   │  │      entities        │
│      Zod schemas │  │      shared widgets│  │                      │
└──────┬───────────┘  └───────┬────────────┘  └──────────────────────┘
       │                      │
       └──────────┬───────────┘
┌─────────────────▼────────────────────────────────────────────────────┐
│  src/auth        AuthManager — the ONLY place credentials become a   │
│                  session. No test ever logs in.          (ADR 0004)  │
└─────────────────┬────────────────────────────────────────────────────┘
┌─────────────────▼────────────────────────────────────────────────────┐
│  src/config   validated env, single source of truth      (ADR 0006)  │
│  src/core     logger with secret redaction                           │
│  src/support  ResourceTracker (cleanup) · custom matchers            │
└──────────────────────────────────────────────────────────────────────┘
```

## Responsibilities

| Component             | Owns                                                 | Never contains           |
| --------------------- | ---------------------------------------------------- | ------------------------ |
| `tests/**`            | Scenario intent, assertions, which data a test wants | Locators, URLs, raw HTTP |
| `src/fixtures`        | Wiring tests to the framework; teardown              | Assertions               |
| `src/api/clients`     | Endpoints, headers, typed results, error mapping     | Assertions               |
| `src/api/contracts`   | Zod schemas; TS types inferred from them             | Logic                    |
| `src/ui/pages`        | Locators, intent-level actions, state readers        | Assertions, test data    |
| `src/auth`            | Credentials → session; session persistence           | Per-test logic           |
| `src/data/factories`  | Unique, valid-by-default entities with overrides     | Requests                 |
| `src/support/cleanup` | LIFO, failure-isolating resource teardown            | App knowledge            |

## Authentication — one token, both layers

Phase 2 made this simple: the web app keeps its JWT in
`localStorage.eventhub_token`, and the API accepts the same token as a bearer
header. So a single HTTP login serves the browser _and_ the API — **no test, and
no browser, ever performs a login.**

```
  setup project  (runs once per run, before all other projects)
         │
         │   POST /auth/login          ← plain HTTP, no browser
         ▼
     JWT (7-day lifetime, measured)
         │
         ├──────────────► .auth/<account>.json          storageState file
         │                { origins: [{ origin: <baseUrl>,
         │                             localStorage: [{ name: 'eventhub_token',
         │                                              value: <jwt> }] }] }
         │                        │
         │                        └──► UI + e2e projects: use.storageState
         │                             → the browser opens already signed in
         │
         └──────────────► APIRequestContext created with
                          extraHTTPHeaders.Authorization = `Bearer <jwt>`
                          → API tests receive a pre-authenticated client
```

A test that must be anonymous opts out **visibly**:
`test.use({ storageState: ANONYMOUS_STORAGE_STATE })`. That is how the `401`
negative cases stay honest.

This replaces the `TODO(Phase 4)` placeholder currently in
`src/auth/storage-state.ts` and `tests/setup/auth.setup.ts`.

## Test data and isolation

The shared static events have unpredictable seat counts — during exploration
event 285 dropped from 28 seats while we worked, because other candidates were
booking. Asserting arithmetic against inventory we do not control would be
flaky by design.

So: **every test that depends on price or seat count creates its own event.**
Phase 2 confirmed `POST /events` produces an event private to the creating
account (another account gets `404`), with a price and seat count we choose.
That makes AC2 arithmetic and insufficient-seat cases fully deterministic.

Three isolation rules:

1. **One account per worker** — see [ADR 0008](adr/0008-test-account-strategy.md).
2. **Own event per test** where price or seats matter; shared static events only
   for read-only browsing tests.
3. **Presence-based assertions, never counts.** AC3 asserts _"my reference is in
   the list"_, not _"the list has one item"_ — the only form that survives a
   shared environment and concurrent runs.

## Parallel execution

`fullyParallel: true`, CI capped at 2 workers to stay a polite consumer of a
shared public environment. The auth fixture is **worker-scoped**, so one login
serves every test on that worker. Sharding across CI machines later is a config
change, not a redesign.

## Cleanup

`ResourceTracker` (already implemented) registers each created resource at
creation and removes them LIFO on teardown, isolating failures so one cleanup
error neither masks the test result nor blocks the other removals.

Bookings and user-created events are both deletable, so the data that matters is
fully reversible. Accounts are **not** deletable — which is the decisive factor
in ADR 0008.

## Deliberately not built

Naming the rejections is part of the design: no custom reporter, no BDD/Cucumber
layer, no Screenplay pattern, no wrapper abstraction over Playwright's own API,
no builders _and_ factories, no database seeding, no retry logic (ADR 0005).
Each would add surface area without answering a requirement.
