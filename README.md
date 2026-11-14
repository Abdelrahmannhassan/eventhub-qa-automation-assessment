# EventHub — QA Automation Practical Assessment

Unified UI + API test automation framework for [EventHub](https://eventhub.rahulshettyacademy.com),
built with **Playwright + TypeScript**.

Scope: user story **US-114 — Book tickets for an event** (AC1–AC5).

> **Status: Phase 1 of 8 complete — project initialisation.**
> The framework skeleton, toolchain, configuration, authorization design, quality
> gates and decision records are in place. Page Objects, API clients and tests are
> intentionally **not** written yet: the application and its API have not been
> explored, and this project does not commit guessed locators or endpoints
> (see `CLAUDE.md` §1). Sections marked _Pending_ below are filled in by later phases.

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
layering. Full reasoning for every choice is in **[`docs/adr/`](docs/adr/)**.

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
│   ├── story-review.md           US-114 review + PO questions        (Phase 3)
│   ├── api-findings.md           Observed API surface & discrepancies (Phase 2)
│   ├── test-strategy.md          Coverage, priorities, layer choice   (Phase 5)
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

> **Phase 1 ships the wiring plus a TEMPORARY anonymous placeholder session**
> (marked `TODO(Phase 4)` in `src/auth/storage-state.ts` and
> `tests/setup/auth.setup.ts`). It exists only so the suite runs end to end
> before the auth mechanism is known. Phase 2 observes the real mechanism;
> Phase 4 replaces the placeholder with a genuine `AuthManager` session.

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

## Story review — US-114

_Pending — Phase 3._ Will document what is missing, unclear or wrong in the user
story, the questions for the Product Owner, and every discrepancy found between
the application, the API documentation and the story.

## Test strategy

_Pending — Phase 5._ Will document what is covered at which layer and why,
positive/negative/edge scenarios, and priorities.

## CI/CD

_Pending — Phase 7._ GitHub Actions on every push, with published reports.

## Limitations & what I would do with more time

_Pending — Phase 8._

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
