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

## Phase 2 — Exploration

### Q: How did you explore the application, and why that way?

Three passes, each answering something the others could not:

1. **The spec, extracted rather than trusted.** There is no `docs-json`
   endpoint, so the OpenAPI document was pulled out of the Swagger UI bundle and
   parsed. That gave the _claimed_ contract.
2. **Scripted HTTP**, unauthenticated and then as two separate accounts. That
   gave the _real_ contract — and the gap between the two is where most findings
   came from.
3. **A headed browser with every API call captured.** That revealed what the UI
   actually sends versus what the API stores, which no amount of reading either
   side separately would show.

The two-account design was deliberate: a single account cannot prove isolation.
Account B existed only to attempt to read and cancel account A's booking.

### Q: What is the single most important thing you found?

That **US-114's central premise is wrong.** The story says _"As a visitor to
EventHub I want to book tickets"_, but the application has no visitor flow at
all — `/events` redirects to `/login` and `POST /api/bookings` returns `401`.

This matters because it is not a cosmetic wording issue: it changes who the
feature is for, and it decides whether AC1 and AC5 describe a defect in the
product or a defect in the story. That is a Product Owner question, not a
decision a QA engineer should quietly make — so it was recorded, not assumed.

### Q: You found 27 mismatches. Which would you actually escalate first?

Ranking by consequence, not by count:

1. **M1 — security undeclared on 13 of 14 operations.** Anyone generating a
   client from this spec gets a client that cannot authenticate. It is the
   single most expensive documentation defect here.
2. **S1 — the "visitor" premise.** Blocks a shared understanding of the feature.
3. **M12 — `customerEmail` is silently rewritten** (Gmail dots and `+suffix`
   stripped), _and_ inconsistently: `/auth/register` does not do it. A customer
   could receive tickets at an address they did not type.
4. **M11 — cancellation hard-deletes** while the schema advertises a `cancelled`
   status. If a cancellation record is ever needed for audit or refunds, this is
   a data-loss design, not a reporting gap.

The rest are real but cheaper: type mismatches, undocumented fields, inconsistent
status codes.

### Q: Why didn't you write tests during exploration?

Because a test written against a guess encodes the guess. Two concrete examples
from this exploration that a reasonable guess would have got wrong:

- The booking reference is **`H-Z91U0V`**, not the documented `EVT-XXXXXX`.
- `totalPrice` is the **string** `"5000"`, so `expect(total).toBe(5000)` fails —
  for the wrong reason, which is the worst kind of failure.

Both would have produced a red test that looked like a product bug.

### Q: How did the findings change your framework design?

Four concrete changes, each traceable to an observation:

- **Auth**: the web app keeps its JWT in `localStorage.eventhub_token`, and the
  API takes the same token as a bearer header. So one HTTP login can serve both
  layers — `AuthManager` acquires a token and writes it into Playwright
  `storageState` as a `localStorage` origin entry. **No browser login anywhere.**
- **Isolation**: registration needs no email verification, so **per-worker
  accounts** are viable — real isolation on a shared public environment instead
  of contention over one login.
- **Deterministic data**: user-created events are **private to the creating
  account** (another account gets `404`). Tests can create an event with a known
  price and seat count, which is what makes AC2 arithmetic and insufficient-seat
  tests deterministic instead of dependent on whatever seats other candidates
  left behind.
- **Contracts**: `price`/`totalPrice` are strings and `customerEmail` is
  rewritten server-side. Zod schemas model what the API _actually_ returns, and
  the factory owns the email trap so individual tests cannot fall into it.

### Q: You were testing on a shared public environment. How did you avoid damaging it?

Every booking created during exploration was deleted, and event 284's seat count
was verified back at its original 2004. Boundary probes were chosen to fail
validation where possible, so they created nothing. The one bulk operation
available (`DELETE /bookings`) was exercised once to document it, not relied on.

Worth saying out loud: the environment showed clear signs of other candidates
working in parallel — event 285's `availableSeats` dropped from 28 while the
session was running. That is precisely why the framework creates its own events
rather than asserting against shared inventory.

---

## Phase 3 — Story review

### Q: What is the most important thing you found reviewing US-114?

That **the actor is wrong**, and that this is not a wording problem.

The story says _"As a visitor to EventHub I want to book tickets"_. There is no
visitor flow: `/` and `/events` redirect to `/login`, and `POST /api/bookings`
returns `401`. The story also contains no registration or login step, so as
written it cannot be implemented.

Why it matters more than the other findings: it changes **who the feature is
for**, and it decides whether AC1 and AC5 describe a defect in the product or a
defect in the story. Those two readings produce opposite test suites. One says
"authenticate, then book"; the other says "anonymous booking must work, and today
it returns 401, so these tests should fail". That is a Product Owner's call.

### Q: The application passes all five ACs. So was the review worth doing?

That is exactly the point worth making. **The product is mostly fine; the
specification is not.** All five ACs pass end to end — and three of the five are
not testable as written:

- AC5's _"the same works"_ does not say same _what_, and `POST /api/bookings`
  alone cannot satisfy AC3 or AC4 — those need `GET /bookings` and
  `DELETE /bookings/{id}`, which AC5 never names.
- AC3's _"appears in My Bookings"_ does not say what must appear, or how fast.
- AC4's _"I can cancel"_ never says what cancelling _does_. The most valuable
  behaviour — seats returning to the event — is required by no AC at all.

A suite built from this story would pass while testing almost nothing. Reviewing
the story is how you find that _before_ writing 40 tests.

### Q: Give an example of a gap a reader would not notice.

**Who owns a booking.** The booking is tied to the authenticated account
(`userId`), while `customerName`/`customerEmail`/`customerPhone` are free text.
During exploration, account A booked using an unrelated email — and that person
can see nothing: the booking appears only in A's "My Bookings".

So AC1's _"my booking is created"_ is ambiguous: created for the buyer, or for
the attendee? If booking on someone's behalf is intended, there is a missing
requirement about the attendee's access. If it is not intended, there is a
missing validation rule. Either way the story does not say, and the product
quietly picked one.

The second example: **payment does not exist**. Not in the form, not in
`POST /bookings`. A story about buying tickets with no payment step is either a
deliberate reserve-now-pay-later model or a major omission — and nobody wrote
down which.

### Q: You raised 13 questions. Isn't that just blocking the work?

No — the review ships with **8 written assumptions**, each with its blast radius
if wrong. That is the difference between raising questions and hiding behind
them.

Example: A1 assumes "visitor" means "registered user", so the tests
authenticate. If the PO says anonymous booking really is required, AC1/AC5
become product defects and the suite needs tests that document the gap. The
assumption is cheap to reverse because it is isolated in the auth layer, and it
is written down so nobody mistakes it for a verified fact.

A2 is the same shape: the booking reference is asserted as
`^[A-Z]-[A-Z0-9]{6}$` — what the application actually produces — while the
documented `EVT-XXXXXX` is reported as a documentation defect. The alternative
would have been to assert the documented format, fail, and call a documentation
error a product bug.

### Q: Would you have rewritten the story for a real Product Owner?

Yes, and the review includes a draft — but framed as input to refinement, not as
a decision already made. Three things change in it: the actor becomes
"registered user", every AC names an **observable outcome** (including the seat
count, which the original never mentions), and the genuinely open decisions —
retention on cancel, cancellation deadline, reference format, currency — are
marked **TBD with a question reference** instead of being invented.

Marking something TBD in a story is honest. Silently inventing it is how a test
suite ends up enforcing a rule nobody agreed to.

---

## Phase 4 — Architecture design

### Q: Walk me through how authorization works, concretely.

A single HTTP login serves both layers, and no test — and no browser — ever logs in.

The `setup` project runs once per execution and calls `POST /auth/login`
directly over HTTP. The JWT it returns goes two places: into a Playwright
`storageState` file as a `localStorage` entry under `eventhub_token`, which UI
projects consume declaratively via `use.storageState`; and into an
`APIRequestContext` created with `extraHTTPHeaders.Authorization`, which API
tests receive from a fixture.

The reason this is so clean is a Phase 2 observation, not a design preference:
the web app stores its token in `localStorage.eventhub_token` and the API accepts
the same token as a bearer header. **One credential, two transports.** Had the app
used an HttpOnly cookie session, this would have needed a real browser login in
the setup project.

Tests that must be anonymous opt out visibly with
`test.use({ storageState: ANONYMOUS_STORAGE_STATE })` — that is what keeps the
`401` negative cases honest instead of accidentally authenticated.

### Q: Why a fixed pool of accounts instead of registering fresh ones per run?

This is the decision I would most want to be asked about, because the textbook
answer is the wrong one here.

The textbook answer is "always create fresh data" — and it is right **when you
can delete what you create**. On EventHub you cannot: registration is free and
instant, but **there is no endpoint to delete an account**. So "a fresh account
per worker per run" quietly means "permanent orphan accounts on a server we do
not own", multiplying by every push, every worker, for years. On a shared public
environment where the brief explicitly asks us to clean up, that is the opposite
of good citizenship.

So the deciding factor is not isolation theory — both options isolate fine — it
is **cleanup asymmetry**. A fixed pool creates nothing per run.

The pool's weaknesses are all mitigable by test design we want regardless:
leftover state is handled by `ResourceTracker` plus each test creating its own
event; concurrent runs sharing an account are handled by **presence-based
assertions** ("my reference is in the list", never "the list has one item"),
which is correct practice on any shared environment anyway.

One detail worth volunteering: the pool separates a **"foreign" account** used
only to attempt unauthorized reads and cancels. It creates nothing, so every
worker can share it safely. Without that split, the cross-account authorization
test would have to borrow another worker's account — reintroducing exactly the
interference the pool exists to prevent.

And option (a) stays as a documented opt-in fallback, so a contributor without
secrets can still run the suite — just never by accident.

### Q: How do you keep AC2's arithmetic from being flaky?

By not asserting against inventory we do not control. During exploration, event
285's available seats dropped from 28 while we were working, because other
candidates were booking against the same shared events.

`POST /events` creates an event that is **private to the creating account** —
another account gets `404` — with a price and seat count we choose. So any test
that depends on price or seat count creates its own event first. That makes AC2's
multiplication and the insufficient-seat boundary deterministic, instead of
dependent on whatever seats are left that minute.

Shared static events are still used, but only for read-only browsing tests where
inventory does not matter.

---

## Phase 5 — Test strategy

### Q: Only 31 tests. Isn't that thin for a booking flow?

The suite is sized by **distinct risk**, not by permutations.

Every API validation rule is covered once, at its boundary. Every piece of UI
behaviour is covered once, in the browser. Authorization is covered from the one
angle that matters — a non-owner attempting access. Nothing is tested twice at
two layers, except the three AC5 parity tests, where the duplication _is_ the
requirement.

What a bigger number would buy is more inputs through the same code path. The
second malformed email exercises the same validator as the first: cost without
coverage. On a shared public server it is also extra load on other people's work.

The number I would defend changing is coverage of things we _chose_ to defer —
the last-seat race, cross-browser, accessibility — not more validation
permutations.

### Q: How did you decide what goes in the UI versus the API?

One question: **what is the cheapest layer that can actually prove this rule?**

Validation boundaries, authorization, status codes and response shapes go to the
API — fast, precise, and the failure message names the offending field. A UI test
proving `quantity: 0` is rejected tells you less and costs roughly twenty times
as much.

The UI gets what only a browser can prove: the quantity stepper disabling at its
bounds, the price breakdown rendering, the confirmation panel appearing with a
reference, the bookings list, the cancel dialog. An API test cannot prove a user
_saw_ a booking reference.

The deliberate asymmetry: the API runs the full validation matrix, the UI runs
**one** representative failure. That single test proves the UI surfaces errors at
all; re-running every boundary through the browser would add runtime, not
information.

And arrange/cleanup always goes through the API, even for UI tests — driving
twenty UI steps to reach the screen under test produces a slow test that fails
for reasons unrelated to its purpose.

### Q: You have tests that assert current behaviour you called a defect. Isn't that cementing bugs?

This is the distinction I would most want to draw, because it looks like that
from the outside.

There are three kinds of test, and a failure in each means something different:
**AC tests** (failure = product defect), **contract tests** (failure = API shape
drift), and **`@characterization`** tests.

Characterization tests pin behaviour that is **genuinely open with the Product
Owner** — is the Gmail email rewrite intended? Should a cancelled booking be
retained? They exist so that a _silent change_ gets noticed, and each links to
its open question. They are not an assertion that the behaviour is correct.

The honest proof that this is not bug-laundering: **two findings get no test at
all.** Past-event bookability and the stale seat count are behaviours I believe
are wrong, so I refused to encode them either way — asserting them would cement
them. They are reported as defects, and they get automated once the PO decides
which direction is correct.

### Q: What is the single most valuable test in the suite?

Test 21: **the foreign account cannot cancel my booking.**

It is the one test that would catch a real authorization regression, and
authorization regressions are the failures that actually hurt users. It also
needs two accounts simultaneously, which is why the account pool reserves a
dedicated "foreign" account that creates nothing (ADR 0008) — a single-account
suite simply cannot write this test.

Worth noting it currently passes for a slightly wrong reason: the API returns
`404` rather than `403` for a non-owner delete. The protection is real; the
status code is inconsistent with the `403` that a non-owner _read_ returns. The
test asserts the behaviour that matters — the booking survives — and the
inconsistency is filed as a separate low-severity defect.

### Q: Why aren't you load-testing or probing rate limits?

Because it is someone else's server. EventHub is a shared public practice
environment with other candidates working on it right now — we watched event
285's seat count drop mid-session.

That is an ethical limit, not a technical one, and it is worth stating plainly in
an interview: I can describe how I _would_ load-test it in a dedicated
environment, but doing it here would degrade other people's work.

The same reasoning kept rate-limit probing out of Phase 2, and it is why CI caps
itself at 2 workers.

---

## Phase 6a — Framework implementation

### Q: Your strict Zod contracts failed on the first run. Wasn't that a waste?

The opposite — that failure is the argument for them.

`POST /events` returns `{ success, data, message }`. My Phase 2 probe had printed
only the `data` member, so I had modelled the envelope without `message`, and the
strict schema rejected it with `Unrecognized key: "message"` on the very first
run.

A permissive schema would have silently stripped the unknown key and the suite
would have gone green while my model of the API was wrong. Instead I got a
precise, one-line diagnosis, went back and captured the exact envelope for all
nine endpoints, and recorded the table in `api-findings.md`.

That is what runtime contract validation is _for_: it catches the gap between
what you believe the API returns and what it actually returns — including when
the wrong belief is your own.

### Q: Tell me about a bug you found in your own framework.

Two, both on the shared environment, and both worth fixing properly.

**A resource leak.** When the contract violation above was thrown, the event had
already been created server-side (`201`). But the client threw _before returning_,
so the `tracker.track(...)` line that followed never executed — and four orphan
events were left on someone else's server. Cleanup was correct; the _registration_
was unreachable on the failure path.

The fix changed the shape of the result rather than patching the call site:
`ApiResult` now always exposes `status` and `body` safely, and only touching
`.data` can throw. A `TestResources` helper registers cleanup **from the raw
body, before anything can throw**. That removes the whole class of failure
instead of one instance of it.

**A JWT in the logs.** A transient `ECONNRESET` on a cleanup `DELETE` produced a
Playwright error whose message embedded the full request call log — including
`Authorization: Bearer eyJhbGci…`. My logger redacted sensitive object _keys_,
but this token was inside a message string, so it printed in full. On a public
repository, CI logs are world-readable.

The fix added string-level scrubbing for bare JWTs, `Bearer <token>` and
sensitive header lines, including inside `Error` instances, and I verified it
against the exact string that leaked. The general lesson is the useful part:
**field-level redaction is not enough — secrets arrive inside error messages,
stack traces and third-party call logs.**

### Q: You said no retries, but your cleanup retries once. Explain.

The ban is on retries that hide information. A test retry can turn a real defect
or a real flaky test into a green tick, which destroys the signal.

Cleanup retries cannot do that: teardown runs after the verdict is already
decided. The retry exists because the shared server produced a genuine transient
`ECONNRESET` on a `DELETE`, and an undeleted booking is litter on infrastructure
we do not own. A failure after the retry is still surfaced as a test annotation,
never swallowed.

The one-line version: **retrying a test hides information; retrying a delete
reduces litter.**

### Q: Why is the session worker-scoped rather than produced by the setup project?

Because `storageState` is a **test-scoped** Playwright option, and per-worker
accounts (ADR 0008) require it to vary by worker. A file written once by a
project cannot do that.

So the session is acquired in a worker-scoped fixture — one sign-in per worker —
and a test-scoped `storageState` fixture derives from it. This is Playwright's
documented pattern for running multiple authenticated roles in parallel.

The `setup` project did not disappear; it changed job. It is now a preflight that
asserts the API is reachable and that every pooled account can authenticate. When
a credential is wrong you get one failure named "every pooled account can
authenticate" rather than 32 downstream failures that all look like product bugs.

I would volunteer this as a design that _changed_ during implementation, because
the original ADR said otherwise — and the ADR now records why.

---

## Phase 6b — Completing the suite

### Q: Why did you make the clients lenient after arguing for strict schemas?

Because strictness is not a virtue in itself — it is a decision about **who gets
interrupted when something changes**.

Strict-everywhere proved its worth immediately: it caught an undocumented
`message` field that my own model of the API had missed. But EventHub is a
third-party service. If its maintainers add one harmless field to the event
payload, strict-everywhere means **every flow test that touches an event fails at
once** — thirty red tests, none of them about a booking defect. The suite would
be reporting "the API added a field" as though booking were broken.

So each contract now exists in two modes built from **one shared shape**:
lenient (`z.object`) in the clients, strict (`z.strictObject`) only in
`tests/api/contracts/`. Flow tests still validate types, formats, the
`bookingRef` pattern and enum values — they just no longer fail because a _new_
field appeared. When the API does change shape, exactly one test goes red and
names the field.

Sharing the shape is the part that makes it safe: there is no way to tighten one
mode and forget the other.

For an API you own, strict everywhere is reasonable, because you can fix the
provider. That is the distinction worth drawing.

### Q: You had intermittent failures. What did you do?

Fixed the causes. Neither fix was a retry.

**`ECONNRESET` on API calls**, reproducing in about half of CI-mode runs and
always on a test late in a worker's queue. The cause was mine: a worker-scoped
`APIRequestContext` reused keep-alive sockets for the entire worker run, and the
host closes idle connections on its own schedule — so a later request reused a
socket the server had already dropped. Request contexts became **test-scoped**
while the sign-in stayed worker-scoped: still one login per worker, no stale
sockets.

**`page.goto` timing out at 30s.** Before touching it I measured the host:
API login p50 381ms / p90 850ms, web HTML p50 209ms, and **zero of 60 sequential
requests above 3s**. The host was healthy; the arbitrary part was my own 30s
figure for a full Next.js page load under two concurrent browsers. Raised to 45s.

Result: 6/6 consecutive CI-mode runs green, and the race test 15/15 alone.

The order matters more than the outcome. I measured first, so I could tell the
difference between "the server is slow" (a finding to report) and "my timeout was
arbitrary" (a config bug of mine). Raising a timeout without that evidence is
indistinguishable from hiding a defect.

### Q: The race condition test — what did it tell you?

That the API's atomicity claim holds. A one-seat event we own, two concurrent
`POST`s, and the assertion that **exactly one** returns `201` and the other is
told no seats remain. Two `201`s would mean the event was oversold.

It passed 15/15. I deliberately ran it in isolation and repeatedly rather than
once inside a full suite, because a concurrency test that runs once proves very
little.

Worth saying plainly: had it been intermittent, that **is** the finding — an
overselling race — and it would have been reported as an application defect, not
retried or skipped. A flaky concurrency test is usually a real concurrency bug.

### Q: Why unit-test the logger when everything else is integration?

Because the failure it guards against is **silent**. If redaction breaks, nothing
goes red — tokens just quietly start appearing in world-readable CI logs. That is
exactly the kind of regression that needs a test, and it is also the cheapest
test in the suite: no browser, no network, no session, three milliseconds.

It exists because the leak was real, not hypothetical: a transient `ECONNRESET`
produced a Playwright error whose message embedded `Authorization: Bearer
eyJhbGci…`, and my key-based redaction could not see a token held inside a
string. The test asserts against the exact shape of that message, checks nesting
in objects, arrays and `Error` instances — and also asserts that **harmless
context survives**, because redaction that destroys the diagnostic value of a log
is its own kind of failure.

It also justified a `unit` Playwright project with no `setup` dependency, so it
runs even when the API is down.

---

## Phase 7/8 — The defect, the quarantine, and what I would change

### Q: Talk me through the most serious thing you found.

`POST /bookings` oversells. Two concurrent bookings for the **last seat** both
return `201`, and the lost decrement leaves `availableSeats` at `0` rather than
`-1` — so the event looks correctly sold out while holding two bookings for one
seat. Nothing in the data reveals it. Reproduced in 3 of 6 trials under load with
plain `fetch`, no test framework involved. The documentation explicitly claims
the opposite: _"Atomically create the booking and decrement available seats."_

It is load-dependent: against an idle host, 5/5 trials behaved correctly. The
race window only opens when the server is serving other traffic — which is
exactly when real users would hit it.

### Q: And you nearly missed it. What happened?

This is the part I would lead with, because the methodology error is more
interesting than the bug.

The test passed **15/15** and I reported atomicity as holding. It was wrong. The
suite's API requests were reusing HTTP **keep-alive** connections, so the two
"concurrent" requests were serialised onto a single socket and never raced at the
server. The test was exercising sequential behaviour while claiming to test
concurrency.

It surfaced only because I disabled connection reuse for an unrelated reason —
chasing `ECONNRESET` failures — and then it failed 6/6 immediately.

The lesson: **a green concurrency test proves nothing until you have proved the
requests were genuinely concurrent.** Transport-level pooling will quietly
serialise them, and nothing in the test output tells you.

### Q: How did you handle a known defect in CI without hiding it?

The constraint is that one pipeline status cannot answer two different questions.
"Has anything regressed?" has to stay answerable — which a permanently red gate
cannot do. "Is the known defect still there?" deserves an answer on every run —
which deleting or skipping the test destroys.

So the test keeps its **correct, unchanged assertion**, is tagged
`@known-defect`, and the jobs split: the gate runs `--grep-invert @known-defect`,
and a second job runs only the quarantined tests with `continue-on-error`,
uploading its own report and writing the defect reference and per-run result to
the job summary.

**The detail worth volunteering is why not `test.fail()`.** That is the obvious
answer and it is wrong here: `test.fail()` asserts a test _always_ fails, and
this defect is **intermittent**. On the roughly half of runs where the race does
not reproduce, Playwright reports an _unexpected pass_ and the run goes red. The
annotation would convert an understood defect into a flaky test — the exact
failure mode the project refuses everywhere else.

I also made the second job `needs:` the first, which looks like an ordering
nicety but is not: both jobs act as the same pooled accounts, so running them in
parallel would reintroduce the interference the workflow-level concurrency lock
prevents between runs.

### Q: What is the weakest part of your submission?

The residual flakiness. Recent local gate runs are 12/14 green, and the two
failures were transport-shaped, never assertion logic. I found and properly fixed
three causes — stale pooled connections, an action timeout misapplied to page
readiness, and an arbitrary navigation ceiling — but **I did not root-cause the
remainder**, and I could not reproduce it with direct HTTP under equivalent load
(120/120 requests correct).

I would rather say that plainly than claim a stability I have not demonstrated.
The next step is a HAR capture on failure plus correlation IDs matched against
the provider's logs — and with hindsight I should have done that on the _first_
failure instead of adjusting two timeouts and re-running.

### Q: If you started again, what would you do differently?

Three things:

1. **Prove concurrency before trusting a concurrency test.** This cost me a wrong
   conclusion on the most serious defect in the product.
2. **Capture evidence before tuning.** Both timeout changes were defensible and I
   measured the host first, but a HAR from the first failure would have been
   worth more than two config changes.
3. **Ask the "visitor" question earlier.** It is the single decision that most
   changes the shape of the suite, and it was answerable on day one from a single
   `401`.
