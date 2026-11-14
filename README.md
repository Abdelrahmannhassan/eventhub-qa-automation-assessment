# EventHub — QA Automation Practical Assessment

Unified UI + API test automation framework for [EventHub](https://eventhub.rahulshettyacademy.com),
built with **Playwright + TypeScript**.

Scope: user story **US-114 — Book tickets for an event** (AC1–AC5).

> **Status: complete.** 38 tests (24 API · 8 UI · 3 cross-layer · 3 unit) plus 2
> preflight checks, covering all five acceptance criteria at more than one layer
> each. CI green on every push, with a **High-severity overselling defect** found
> and reported. No retries, no skips, no hardcoded waits.

---

## Quick start

```bash
# Node.js 22.14.0 — see .nvmrc.   nvm use
npm ci                          # NOT `npm install` — see Reproducible installs
npx playwright install chromium

cp .env.example .env            # then fill in values — see Configuration below

npm run verify                  # typecheck + lint + format check
npm test                        # run every project
```

No Java required: reporting uses **Allure Report 3**, which is pure Node
([ADR 0003](docs/adr/0003-reporting-stack.md)).

### Useful commands

| Command                   | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| `npm test`                | All projects (`setup` → `api`, `ui`, `e2e`)        |
| `npm run test:api`        | API layer only                                     |
| `npm run test:ui`         | UI layer only (Chromium)                           |
| `npm run test:e2e`        | Cross-layer journeys                               |
| `npm run test:smoke`      | Tests tagged `@smoke`                              |
| `npm run test:headed`     | UI tests in a visible browser                      |
| `npm run test:debug`      | Playwright Inspector                               |
| `npm run test:ui-mode`    | Playwright UI mode (watch / time-travel)           |
| `npm run report`          | Open the Playwright HTML report                    |
| `npm run allure:generate` | Build the Allure report (needs Java + Allure CLI)  |
| `npm run allure:open`     | Open the Allure report                             |
| `npm run verify`          | Typecheck + lint + format check                    |
| `npm run clean`           | Delete all generated reports, results and sessions |

---

## Architecture

One framework, two layers, separated by Playwright projects and by source
layering. The layer map and auth-flow diagram are in
**[`docs/architecture.md`](docs/architecture.md)**; the reasoning behind every
choice is in **[`docs/adr/`](docs/adr/)**.

```
├── playwright.config.ts          Projects, reporters, timeouts, auth wiring
├── CLAUDE.md                     Coding standards & non-negotiables
│
├── src/                          FRAMEWORK — reusable, no scenario knowledge
│   ├── config/env.ts             Zod-validated configuration (single source of truth)
│   ├── core/logger.ts            Levelled logger with secret redaction
│   ├── auth/                     Credentials → session; session persistence
│   ├── api/
│   │   ├── clients/              One typed client per resource (no assertions)
│   │   └── contracts/            Zod schemas; TS types inferred from them
│   ├── ui/
│   │   ├── pages/                Page Objects — locators + intent-level actions
│   │   └── components/           Widgets shared across pages
│   ├── data/factories/           Unique, valid-by-default test entities
│   ├── fixtures/                 Dependency injection into tests + teardown
│   └── support/
│       ├── cleanup/              Resource tracker (LIFO, failure-isolating)
│       └── assertions/           Domain-specific matchers
│
├── tests/                        INTENT — scenarios and assertions only
│   ├── setup/auth.setup.ts       Runs once before everything: config + session
│   ├── api/                      API-layer tests          → project `api`
│   ├── ui/                       UI-layer tests           → project `ui-chromium`
│   └── e2e/                      Cross-layer journeys     → project `e2e-chromium`
│
├── docs/
│   ├── adr/                      Architecture Decision Records
│   ├── architecture.md           Layer map + auth flow diagram        ✅
│   ├── story-review.md           US-114 review + PO questions        ✅
│   ├── api-findings.md           Observed API surface & discrepancies ✅
│   ├── test-strategy.md          Coverage, priorities, layer choice   ✅
│   └── interview-prep.md         Decision defence notes
│
└── .github/workflows/            CI pipeline                          (Phase 7)
```

### The two rules that keep it maintainable

- **Assertions only in `tests/`.** A Page Object that asserts cannot serve a test
  with a different expectation, and its failure message describes the page object
  instead of the requirement.
- **Locators and URLs only in `src/`.** A markup or endpoint change has exactly
  one place to be fixed.

### Key decisions at a glance

| Decision                                                | Why                                                                            | ADR                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------- |
| One Playwright/TS project, not Playwright + RestAssured | Two runtimes for one flow buys nothing; cross-layer tests (AC5) become trivial | [0001](docs/adr/0001-single-unified-framework.md)  |
| Layered `src/` + path aliases                           | Bounds the cost of change as the suite grows                                   | [0002](docs/adr/0002-layered-architecture.md)      |
| Playwright HTML + JUnit + Allure                        | Debugging, CI machine-readable, and AC traceability + trends                   | [0003](docs/adr/0003-reporting-stack.md)           |
| Auth via `setup` project + `storageState`               | One login per run; zero auth code in tests                                     | [0004](docs/adr/0004-centralised-authorization.md) |
| `retries: 0`, guardrails enforced by lint               | A retry hides either a bad test or a real defect                               | [0005](docs/adr/0005-reliability-policy.md)        |
| Zod-validated config, secrets never in git              | Loud, early failure; a public repo stays safe to publish                       | [0006](docs/adr/0006-configuration-and-secrets.md) |

---

## Authorization

Authorization is handled by the framework, never by a test (the brief requires
this explicitly). Design and trade-offs: **[ADR 0004](docs/adr/0004-centralised-authorization.md)**.

1. The Playwright **`setup` project** runs once, before all others, via
   `dependencies: ['setup']`.
2. It acquires a session and persists it under `.auth/` (git-ignored).
3. **UI projects** consume it declaratively — `use: { storageState: ... }` — so
   every UI test starts already signed in with no auth code in the test.
4. **API tests** get a pre-authenticated request context from a fixture; no test
   ever touches a token.
5. A test that must be anonymous opts out visibly with
   `test.use({ storageState: ANONYMOUS_STORAGE_STATE })`.

**Implemented in Phase 6a.** One HTTP sign-in per worker produces a JWT that is
written into `localStorage.eventhub_token` inside a Playwright storage-state file
— so the browser opens already authenticated — and into an `APIRequestContext`
`Authorization` header for API tests. **No test and no browser ever logs in.**

One implementation detail worth knowing: `storageState` is a _test-scoped_
Playwright option, so it cannot vary per worker from project config. The session
is therefore worker-scoped in the fixture layer, and the `setup` project is a
**preflight** that asserts the API is reachable and every pooled account can
authenticate — one legible failure instead of 32 confusing ones
([ADR 0004](docs/adr/0004-centralised-authorization.md)).

---

## Configuration & secrets

Every input is declared and validated in one place — `src/config/env.ts`. No other
file reads `process.env`. Invalid configuration fails at import time, naming the
offending variable, instead of resurfacing later as a confusing 404 or 401.

**Locally:** `cp .env.example .env` and fill it in. `.env` is git-ignored.

| Variable                                 | Required | Purpose                                    |
| ---------------------------------------- | -------- | ------------------------------------------ |
| `TEST_ENV`                               | no       | Named environment (default `production`)   |
| `BASE_URL`                               | no       | Overrides the web URL for that environment |
| `API_BASE_URL`                           | no       | Overrides the API URL for that environment |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | no¹      | Shared test account                        |
| `LOG_LEVEL`                              | no       | `error` \| `warn` \| `info` \| `debug`     |

¹ Optional at load time; a suite that genuinely needs the shared account fails
with actionable instructions via `requireSharedAccountCredentials()`.

**Protections in place:**

- `.env` and `.auth/` (real session cookies) are git-ignored; only
  `.env.example` — placeholders, no values — is tracked.
- `src/core/logger.ts` redacts any key matching
  `pass|token|secret|authorization|cookie|apikey`, because CI logs on a public
  repository are world-readable.
- Commits use a GitHub `users.noreply` address, so no personal email address
  enters the public git history.

**In CI:** _Pending — Phase 7._ Non-sensitive values (base URLs) will be GitHub
Actions **variables**; credentials will be **secrets**, injected as environment
variables for the test step only and never echoed.

### Reproducible installs

The dependency tree must be identical on a laptop and in CI, or a green pipeline
proves nothing about the code it ran against.

- `package-lock.json` is **committed**.
- `.npmrc` sets **`save-exact=true`**, so a new dependency is pinned to an exact
  version instead of a `^` range. All 13 current dependencies are exact pins.
- `.nvmrc` pins **Node 22.14.0**; CI uses the same version.
- **CI must run `npm ci`, never `npm install`.** `npm ci` installs strictly from
  the lock file and fails if `package.json` and the lock have drifted;
  `npm install` will quietly _rewrite_ the lock to satisfy a range. Use `npm ci`
  locally too, unless you are deliberately changing a dependency.

### Secrets in test artifacts

Keeping credentials out of git is only half the problem. Playwright **traces**
contain `Authorization` headers, cookies and request bodies; **videos** show
typed form data; the **HTML report** embeds both — and GitHub Actions artifacts
on a public repository are downloadable. Full analysis:
**[ADR 0007](docs/adr/0007-secrets-in-test-artifacts.md)**.

Mitigations in place:

| Mitigation                                                                       | Effect                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `trace`/`video` at `retain-on-failure`, never `on`                               | Successful runs publish nothing                    |
| `setup` project runs with `trace: 'off'`, `video: 'off'`                         | The step that submits a password captures no trace |
| CI artifact `retention-days: 7` _(Phase 7)_                                      | Bounds the exposure window                         |
| Dedicated **throwaway** accounts, unique strong passwords, no real personal data | Makes a leaked session near-worthless              |
| `.auth/` git-ignored and never uploaded                                          | The live session never leaves the machine          |
| Logger redacts `pass\|token\|secret\|authorization\|cookie\|apikey`              | CI logs stay clean                                 |

---

## Quality gates

Standards that can be enforced mechanically are enforced mechanically, so review
time goes on design rather than policing basics. `npm run verify` runs
typecheck + lint + format; ESLint additionally fails the build on:

| Rule                                      | Prevents                                        |
| ----------------------------------------- | ----------------------------------------------- |
| `playwright/no-wait-for-timeout`          | sleeping instead of waiting for a condition     |
| `playwright/no-skipped-test`              | quietly parking a failing test                  |
| `playwright/no-conditional-in-test`       | branching that passes without checking          |
| `playwright/no-conditional-expect`        | assertions that may never run                   |
| `playwright/expect-expect`                | a "test" that asserts nothing                   |
| `playwright/no-force-option`              | `force: true` masking a real UI defect          |
| `@typescript-eslint/no-floating-promises` | an un-awaited action — the classic phantom pass |
| `no-console`                              | logs that bypass secret redaction               |

---

## :rotating_light: Headline defect found: the booking endpoint oversells

`POST /bookings` claims to **atomically** decrement seats. It does not. Two
concurrent bookings for the **last remaining seat** both succeed — reproduced in
**3/6 trials** under load with plain `fetch`, no test framework involved:

```
trial 1: statuses [201,201]  bookings created=2  availableSeats=0  *** OVERSOLD ***
trial 2: statuses [201,201]  bookings created=2  availableSeats=0  *** OVERSOLD ***
trial 3: statuses [201,201]  bookings created=2  availableSeats=0  *** OVERSOLD ***
trial 4: statuses [201,400]  bookings created=1  availableSeats=0  ok
```

A decrement is **lost**: after two bookings against one seat `availableSeats` is
`0`, not `-1` — so the event looks correctly sold out while holding two bookings
for one seat, and nothing in the data reveals the problem.

### How the suite handles it

The test that detects this (`tests/api/bookings/pricing-and-seats.spec.ts`)
**still asserts the correct behaviour** — exactly one booking may succeed. It is
tagged `@known-defect` and runs in its own CI job, so a known product defect
cannot mask a genuine regression:

| Job                | Runs                                          | Gates?  | Answers                            |
| ------------------ | --------------------------------------------- | ------- | ---------------------------------- |
| **UI + API suite** | `playwright test --grep-invert @known-defect` | **Yes** | "Has anything regressed?"          |
| **Known defects**  | `playwright test --grep @known-defect`        | **No**  | "Does the defect still reproduce?" |

The known-defects job uploads its own report and writes the defect reference,
severity and per-run result to the job summary.

**Why not `test.fail()`?** Because the defect is **intermittent** (3/6).
`test.fail()` asserts a test _always_ fails, so on the runs where the race does
not reproduce Playwright would report an unexpected pass and go red — turning a
understood defect into a flaky test. Reasoning in
**[ADR 0010](docs/adr/0010-known-defect-quarantine.md)**.

Nothing is skipped, weakened or retried. A green known-defects job is **not** a
fix: with an intermittent defect, "did not reproduce" is not evidence of repair.

Full write-up: [`api-findings.md` §7b](docs/api-findings.md).

> **This was nearly missed, and the reason is worth reading.** The same test
> passed 15/15 earlier in the project. HTTP keep-alive was serialising the two
> "concurrent" requests onto one socket, so they never actually raced — the test
> was exercising sequential behaviour while claiming to test concurrency. It only
> surfaced after connection reuse was disabled while chasing an unrelated
> `ECONNRESET`. **A green concurrency test proves nothing until you have proved
> the requests were genuinely concurrent.**

## Exploration findings

**[`docs/api-findings.md`](docs/api-findings.md)** — everything observed in Phase 2,
with evidence. Headlines:

- **Authentication is a 7-day JWT bearer token**, stored by the web app in
  `localStorage.eventhub_token`. No email verification on registration.
- **Every endpoint except `/health` and `/config` requires authentication** —
  including `POST /bookings`. The OpenAPI spec declares security on only _one_ of
  its 14 operations.
- **US-114's "As a visitor" premise does not hold**: `/` and `/events` redirect to
  `/login`, and `POST /api/bookings` returns `401` without a token.
- **All five acceptance criteria otherwise work**, verified end to end in both the
  UI and the API, including seat restoration on cancel.
- **27 mismatches** recorded across docs-vs-API, app-vs-story and UI-vs-API —
  among them a silent server-side rewrite of `customerEmail`, an undocumented
  bulk `DELETE /bookings`, prices returned as strings, a booking-reference format
  that differs from the documented one, and an events page that does not refresh
  availability after a booking.

## Story review — US-114

**[`docs/story-review.md`](docs/story-review.md)** — the full review. Summary:

The application largely works — **all five acceptance criteria pass end to end**.
The problem is that US-114 is not a usable specification.

|                                         |        |
| --------------------------------------- | ------ |
| Statements that are factually **wrong** | 2      |
| ACs **not testable as written**         | 3 of 5 |
| **Missing** requirements                | 17     |
| **Questions** for the Product Owner     | 13     |

The biggest issue is the **actor**: the story is written for a "visitor", and no
visitor flow exists — `/events` redirects to `/login` and `POST /api/bookings`
returns `401`. That decides whether AC1/AC5 are product defects or story defects,
so it is a Product Owner question, not something QA should quietly assume.

The three gaps that matter most after that: **payment does not exist anywhere**
in the story or the product; **who owns a booking** is ambiguous (the account, or
the person whose email was typed into the form — they are not the same, and the
latter can see nothing); and **"the same works through the API"** in AC5 points at
an OpenAPI document that disagrees with the running API in 15 places.

The review also records **8 explicit assumptions** the automation encodes until
the PO answers, each with its impact if wrong, plus a suggested rewrite that
splits the story in two and marks the genuinely open decisions as TBD rather than
inventing them.

## Tests that document behaviour rather than require it

Three tests are tagged **`@characterization`**. They pin behaviour that is
**still open with the Product Owner**, so that a silent change is noticed. They
are **not** a statement that the behaviour is correct, and their names say so.

| Test                                        | What it pins                                                                                                                     | Defect / question                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `tests/api/bookings/create-booking.spec.ts` | `quantity: "3"` as a string is accepted and coerced, contradicting the API's own _"must be an integer"_ message                  | **M14** · [question 14](docs/story-review.md) |
| `tests/api/bookings/cancel-booking.spec.ts` | Cancelling **hard-deletes** the booking, so the documented status `cancelled` is unreachable and no cancellation record survives | **M11** · [question 4](docs/story-review.md)  |
| `tests/api/bookings/cancel-booking.spec.ts` | Cancelling the same booking twice returns `404` rather than being idempotent                                                     | **M11** · [question 4](docs/story-review.md)  |

Each test name begins with **"DOCUMENTS CURRENT BEHAVIOUR (not a requirement)"**
and carries its defect reference, so the distinction survives into the Allure
report where someone reads it out of context.

Two findings deliberately have **no test at all** — past-event bookability and
the stale seat count on the event page. Asserting them in either direction would
cement behaviour we believe is wrong, so they stay reported as defects
([story-review.md §8](docs/story-review.md)) until the PO decides.

## Test strategy

**[`docs/test-strategy.md`](docs/test-strategy.md)** — the full strategy.
**31 tests: 19 API, 9 UI, 3 cross-layer; 8 tagged `@smoke`.**

Three principles decide the whole shape:

1. **Test a rule once, at the cheapest layer that can prove it.** Validation
   boundaries live at the API; the UI gets one representative case to prove it
   surfaces errors at all.
2. **Use the UI only for what only a browser can prove** — the stepper, the price
   breakdown, the confirmation panel, the bookings list, the cancel dialog.
3. **Never assert against data we do not own.** Every price- or seat-dependent
   test creates its own event first, because the shared static events lose seats
   to other candidates mid-run.

Tests come in three kinds, because a failure must mean something specific: **AC
tests** (failure = product defect), **contract tests** (failure = API shape
drift), and **`@characterization`** tests that pin behaviour still open with the
PO so a silent change gets noticed. Characterization tests are not a way to make
a bug green — each links to its open question.

Two findings get **no test at all** — past-event bookability and the stale seat
count. Asserting them would cement behaviour we believe is wrong; they are
reported as defects instead.

Every test is tagged `@AC1`…`@AC5`, so the Allure report answers _"is AC2
covered?"_ directly — the traceability that justified Allure (ADR 0003).

## CI/CD

_Pending — Phase 7._ GitHub Actions on every push, with published reports.

## Limitations & what I would do with more time

### Known limitations

**1. Residual intermittent failures against the shared host.** Recent local gate
runs: **12/14 green**. The two failures were a sign-in failure and an unexpected
status on an unauthenticated read — both transport-shaped, **never assertion
logic**. I could not reproduce either with direct HTTP under equivalent load
(120/120 requests correct, 20/20 unauthenticated reads correctly `401`). Three
causes were found and fixed properly along the way — stale pooled connections,
an action-timeout used for page readiness, and an arbitrary navigation timeout —
but the residue is **not root-caused**, and it is deliberately **not masked with
retries** (ADR 0005). If this were a service we owned, the next step is HAR
capture on failure plus correlation IDs matched against the provider's logs.

**2. The overselling defect is open.** It is quarantined and reported on every
run (ADR 0010), not fixed — that needs a product change.

**3. Thirteen Product Owner questions are unanswered,** so **8 documented
assumptions** are encoded in the suite. Several tests change if the answers
differ; each assumption records its blast radius (`story-review.md` §5).

**4. Chromium only.** No WebKit or Firefox, and no mobile viewports. Two config
entries each — deferred because the booking flow uses no browser-specific APIs.

**5. No accessibility audit.** Duplicate `id` attributes were found incidentally,
which suggests more. A11y deserves its own `axe` pass, not a side effect of
functional tests.

**6. No performance or load testing, and no rate-limit probing.** An ethical
limit, not a technical one: this is a shared practice server other candidates are
using right now.

**7. Parallelism is capped at 2 workers** by the account pool. Raising it means
adding an account and a secret (ADR 0008).

**8. Allure history is not persisted,** so the report shows no cross-run trends —
one of the two reasons Allure was chosen. It needs results carried between runs
via a `gh-pages` branch or a cache (noted in ADR 0003, not implemented).

**9. CI runs on push to any branch** with no pull-request flow, branch protection
or required checks.

### What I would do next, in priority order

1. **Root-cause the residual flakiness** — HAR on failure, correlation IDs, and a
   long soak run to characterise it. Right now I can describe it but not explain
   it, and that is the single weakest claim in this repository.
2. **Persist Allure history** to a `gh-pages` branch, unlocking the trend and
   flakiness view that justified Allure in the first place.
3. **Answer the PO questions** and convert the 8 assumptions into real
   assertions — particularly the "visitor" question, which decides whether AC1
   and AC5 describe defects.
4. **Accessibility pass** with `axe-core`, starting from the duplicate-id finding.
5. **Cross-browser and mobile projects**, once there is evidence the risk is real.
6. **A quarantine budget** — fail CI if the `@known-defect` count grows, so
   quarantine cannot quietly become a dumping ground.
7. **Snapshot-based contract tests** so API drift is detectable even when the
   live service is unavailable.
8. **Shard CI across runners** once the account pool is large enough to make it
   worthwhile.

### What I would change about my own approach

Two things, honestly:

- **I trusted a green concurrency test.** The race test passed 15/15 and I
  reported atomicity as holding. It was being serialised by HTTP keep-alive and
  never raced at all. I should have proved the requests were concurrent _before_
  believing the result — the defect it hides is the most serious finding here.
- **I tuned two timeouts before fully measuring.** They were defensible changes
  and I measured the host first, but with hindsight I would have captured a HAR
  on the first failure rather than adjusting ceilings and re-running.

## Submission checklist

What the brief asked for, and where it is:

| Required                                                 | Where                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Review the story; note what is missing, unclear or wrong | [`docs/story-review.md`](docs/story-review.md) — 2 wrong, 17 missing, 6 unclear, 3 of 5 ACs untestable as written                              |
| Questions for the Product Owner                          | `story-review.md` §4 — 13, prioritised                                                                                                         |
| Discrepancies between app, API docs and story            | [`docs/api-findings.md`](docs/api-findings.md) §7 — 15 docs-vs-API, 7 app-vs-story, 6 UI-vs-API                                                |
| UI and API automation                                    | 38 tests: 24 API, 8 UI, 3 cross-layer, 3 unit                                                                                                  |
| A framework that can grow                                | [`docs/architecture.md`](docs/architecture.md) + 10 ADRs                                                                                       |
| Authorization handled by the framework                   | [ADR 0004](docs/adr/0004-centralised-authorization.md) — one HTTP sign-in per worker, no test and no browser logs in                           |
| GitHub Actions on every push                             | [`.github/workflows/ci.yml`](.github/workflows/ci.yml)                                                                                         |
| Test report available                                    | Playwright HTML + Allure single-file + JUnit, uploaded on every run (7-day retention)                                                          |
| A completed run visible in the Actions tab               | [Actions](../../actions)                                                                                                                       |
| Configuration and secrets explained                      | README "Configuration & secrets" + [ADR 0006](docs/adr/0006-configuration-and-secrets.md) / [0007](docs/adr/0007-secrets-in-test-artifacts.md) |
| Credentials needed to run the tests                      | See "Credentials for reviewers" below                                                                                                          |
| Key decisions explained                                  | 10 ADRs, each with alternatives and consequences                                                                                               |
| What I would do with more time                           | The section above                                                                                                                              |

## Credentials for reviewers

The suite needs three throwaway EventHub accounts. They are **not** in this
repository (ADR 0006), and they are already configured as GitHub Actions secrets,
so **CI runs without any setup**.

To run locally, either:

- **Use your own accounts** — register three at
  [eventhub.rahulshettyacademy.com/register](https://eventhub.rahulshettyacademy.com/register),
  then `cp .env.example .env` and fill in the six values. No email verification
  is required, so this takes about a minute.
- **Or ask me for the credentials** for the three accounts the CI runs use. They
  are disposable, hold no real personal data, and are rotatable by changing one
  secret — sharing them out of band is deliberate rather than committing them
  (ADR 0007).

---

## Project phases

| Phase | Scope                                       | Status                    |
| ----- | ------------------------------------------- | ------------------------- |
| 1     | Project initialisation & architecture setup | ✅ Complete (+ hardening) |
| 2     | Application & API exploration               | ⏭ Next                    |
| 3     | Story review & PO questions                 | Pending                   |
| 4     | Architecture design sign-off                | Pending                   |
| 5     | Test strategy                               | Pending                   |
| 6     | Implementation                              | Pending                   |
| 7     | CI/CD                                       | Pending                   |
| 8     | Final review                                | Pending                   |
