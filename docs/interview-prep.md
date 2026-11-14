# Interview preparation — defending this implementation

Companion to `docs/adr/`. The ADRs record _what_ was decided; this file prepares
you to **defend it out loud**, including the weak points. Grows with each phase.

> Rule of thumb for the interview: lead with the trade-off, not the feature.
> "We chose X; the cost is Y; we accepted that because Z" is a senior answer.
> "We used X because it's best practice" is not.

---

## Phase 1 — Architecture & toolchain

### Q: Why Playwright alone instead of Playwright + RestAssured?

The brief offered both. Two runtimes means two build systems, two dependency
trees, two reporting pipelines and two languages a team must stay fluent in —
for a single booking flow.

The decisive argument is **AC5**: it asks whether the API does the same thing as
the UI. A check like _"book through the UI, confirm through the API, clean up
through the API"_ is a few lines in one process and awkward across two runtimes.
Playwright's `APIRequestContext` also attaches API calls to the same trace as UI
actions, so a cross-layer failure is debuggable in one view.

**Where two tools would win:** a large organisation with separate teams owning
API and UI, or a Java-first shop whose engineers would otherwise not maintain
TypeScript. Say this — it shows the decision was contextual, not dogmatic.

**Honest cost:** we gave up RestAssured's given/when/then readability, so API
readability now depends on our own client design.

### Q: "Authorization must be handled by the framework." How did you do that, specifically?

Four mechanisms, no auth code in any test:

1. A Playwright **`setup` project** runs once per execution — other projects
   declare `dependencies: ['setup']`.
2. `AuthManager` is the only component that exchanges credentials for a session;
   it persists the result under `.auth/` (git-ignored).
3. UI projects consume it **declaratively**: `use: { storageState: ... }`. Tests
   open the browser already signed in.
4. API tests receive a **pre-authenticated request context** from a fixture, so
   no test handles a token.

Tests that must be anonymous opt out **visibly**:
`test.use({ storageState: ANONYMOUS_STORAGE_STATE })`.

**Why a setup project rather than `globalSetup`?** `globalSetup` is a plain
function: no fixtures, and it produces no entry in the trace or report. When
login breaks, the setup-project version shows one clearly failed step instead of
forty mysterious downstream failures.

**Follow-up you should expect — "what if the session expires mid-run?"** Honest
answer: one acquisition per run is a real limitation. The mitigation is
re-acquisition on a 401 inside `AuthManager`, and it is deliberately deferred to
Phase 6 because token lifetime is not yet known. Saying "I don't know the token
lifetime yet, so I haven't guessed at a refresh strategy" is stronger than
inventing one.

### Q: Your suite has zero retries. Isn't `retries: 1` on CI standard?

It is, and it is defensible against genuinely flaky third-party
infrastructure — EventHub is a shared public environment, so it may yet become
justified here.

We started at zero deliberately: **a retry hides whether the test is wrong or
the product is unstable.** We want to measure instability before masking it. If
evidence of infrastructure flakiness appears, we will add retries _as a
documented compensation with that evidence recorded_ — not as a silent default.

Stability comes instead from **isolation**: unique data per test, so parallel
execution can never be the cause of a failure.

Strong closing line: _"I'd rather own a red pipeline I can explain than a green
one I can't trust."_

### Q: Isn't a `src/` tree with eight directories overengineering for one flow?

Fair challenge. The test for every directory was: _does it solve a stated
requirement or bound a real cost of change?_

- `config`, `auth`, `fixtures`, `support/cleanup` → each maps to an explicit
  requirement in the brief (configuration, centralised authorization, test
  isolation, cleanup on a shared environment).
- `api/clients` + `ui/pages` → bound the cost of an endpoint or markup change to
  one file.
- `data/factories` → what makes parallel execution safe.

What we **did not** build, on purpose: no custom reporter, no BDD/Cucumber layer,
no Screenplay pattern, no abstraction over Playwright's API, no builders _and_
factories, no database seeding utilities. Naming your rejections is the most
convincing way to answer this question.

### Q: Why Allure if Playwright already has an HTML report?

They answer different questions, so we run both.

Playwright HTML is the **debugging** report — trace, video, step timeline, zero
extra tooling. Nothing debugs a Playwright failure better, and Allure cannot
replace it because it does not render traces.

Allure is the **traceability and trend** report. Two things the built-in report
cannot do: tag each test with US-114 and its acceptance criterion so the report
itself answers _"is AC2 covered?"_, and keep **history across runs** to expose
flakiness.

**Name the cost yourself:** Allure needs a JRE plus the Allure CLI, report
generation is a second step, and history needs results persisted between runs.
Add: _"it's one reporter entry and one CI step — if the Java dependency isn't
worth it, removing it is a two-line change."_ That shows you evaluated rather
than adopted.

### Q: Why Zod schemas instead of TypeScript interfaces for API contracts?

A TypeScript interface is erased at runtime: it describes what you _believe_ the
API returns and cannot detect when that stops being true. A Zod schema validates
the **actual** response, and `z.infer` derives the static type from the same
definition — so compile-time types and runtime reality cannot drift apart.

Practically, it turns a silent `undefined` creeping through three layers into one
clear failure that names the field. It is contract testing at low cost.

### Q: How does this framework support a team of five adding tests for two years?

Four properties, concretely:

- **Predictable placement** — the layering table in `CLAUDE.md` makes "where does
  this go?" unambiguous, which is what keeps a shared codebase coherent.
- **Low merge-conflict surface** — a new scenario is a new file; shared code is
  small and stable.
- **Mechanically enforced standards** — the rules people forget in review
  (`no-wait-for-timeout`, `no-skipped-test`, `no-floating-promises`) fail the
  build instead.
- **Written reasoning** — ADRs mean a newcomer can overturn a decision
  _knowingly_ rather than re-litigating it from scratch.

Scaling execution: `fullyParallel` with per-test unique data; CI concurrency is
capped at 2 workers to stay a polite consumer of a shared public environment.
Sharding across CI machines is a config change, not a redesign.

### Q: Why is there no test code yet?

Because the application has not been explored. Committing a locator or an
endpoint we have not observed would be guessing, and a guessed test that happens
to pass is worse than no test — it encodes a false belief.

This is written into the project's own rules (`CLAUDE.md` §1): _never invent
application behaviour._ Phase 2 observes the real application and API; Phase 6
implements against those findings.

---

## Phase 2+ — to be written

Added as each phase completes: observed API contract and discrepancies, story
review reasoning, layer-selection rationale per scenario, cleanup strategy,
CI/secret handling.
