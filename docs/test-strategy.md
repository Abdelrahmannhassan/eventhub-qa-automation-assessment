# Test strategy

What gets automated, at which layer, and why. Evidence for every behaviour
referenced here is in [`api-findings.md`](api-findings.md); the open questions
and assumptions are in [`story-review.md`](story-review.md).

## TL;DR

**31 tests** — 19 API, 9 UI, 3 cross-layer. 8 tagged `@smoke`.

Three principles decide everything below:

1. **Test a rule once, at the cheapest layer that can prove it.** Validation
   boundaries belong to the API. The UI gets _one_ representative case to prove
   it surfaces errors at all.
2. **Use the UI only for what only a browser can prove** — rendering, the
   stepper, the totals display, the confirmation, the cancel dialog.
3. **Never assert against data we do not own.** Every price- or seat-dependent
   test creates its own event first.

## Layer selection

| Put it at the... | When                                                                                                                      | Why                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API**          | Validation boundaries, authorization, business rules, contract shape, error codes                                         | Fast, precise, and the failure message names the field. A UI test proving `quantity: 0` is rejected tells you less and costs 20× more.                 |
| **UI**           | Anything a user perceives: the stepper, the price breakdown, the confirmation panel, the bookings list, the cancel dialog | These exist only in the browser. An API test cannot prove a user _saw_ a booking reference.                                                            |
| **Cross-layer**  | AC5 parity                                                                                                                | AC5 asks whether the API does the same thing as the UI. Proving that needs both in one test — the main reason the framework is one project (ADR 0001). |

Arrange and clean up through the **API**, even for UI tests. Driving twenty UI
steps to reach the screen under test makes a slow test that fails for reasons
unrelated to its purpose.

## Three kinds of test

A distinction worth being explicit about, because it governs what a failure means:

| Kind                                     | Asserts                                                                  | A failure means                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| **AC tests**                             | The agreed requirement                                                   | A product defect                                  |
| **Contract tests**                       | Response shape, via Zod schemas                                          | The API changed shape — drift                     |
| **Characterization** `@characterization` | Behaviour we have **questioned with the PO** and that is not yet settled | The behaviour changed — tell us, so we can re-ask |

Characterization tests are **not** a way to make a bug green. They pin behaviour
that is genuinely under discussion (e.g. is the email rewrite intended?) so that
a silent change is noticed. Each one links to its open question, and each is
explicitly tagged so no reader mistakes it for an endorsement.

And some findings get **no test at all**: past-event bookability and the stale
seat count. Asserting them would cement behaviour we believe is wrong. They are
reported as defects (`story-review.md` §8) and will be automated once the PO says
which way they should go.

## Coverage

`P` = positive · `N` = negative · `E` = edge. `S` = `@smoke`.

### AC1 — booking is created, confirmation shows a reference

| #   | Scenario                                                                                                                                                         | Layer | Kind                      | Tag   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------- | ----- |
| 1   | Book an own event, qty 2 → confirmation panel shows reference, customer, tickets, total                                                                          | UI    | P                         | **S** |
| 2   | `POST /bookings` → `201`, response matches the Zod contract, `bookingRef` matches `^[A-Z]-[A-Z0-9]{6}$`, `status: confirmed`, `userId` is the acting account     | API   | P                         | **S** |
| 3   | Two bookings produce two different references                                                                                                                    | API   | E                         |       |
| 4   | One representative validation failure is surfaced in the UI (phone too short) and no booking is created                                                          | UI    | N                         |       |
| 5   | Validation matrix: `quantity` 0 / 11 / 1.5; `customerName` 1 char; `customerPhone` 3 digits; malformed email; empty body — each `400` naming the offending field | API   | N                         |       |
| 6   | `eventId` that does not exist → `404 "Event with id … not found"`                                                                                                | API   | N                         |       |
| 7   | `quantity: "3"` as a string is accepted and coerced                                                                                                              | API   | `@characterization` (Q14) |       |

Test 5 is one test over a table of cases, not seven tests — same assertion
shape, different inputs.

### AC2 — total = ticket price × quantity

| #   | Scenario                                                                             | Layer | Kind | Tag   |
| --- | ------------------------------------------------------------------------------------ | ----- | ---- | ----- |
| 8   | Own event at a known price: total and line item are correct at qty 1, 2, 3, 10       | UI    | P    | **S** |
| 9   | `totalPrice` equals `price × quantity` (string prices converted explicitly)          | API   | P    | **S** |
| 10  | Stepper bounds: `−` disabled at 1, `+` disabled at 10, `(max 10)` shown              | UI    | E    |       |
| 11  | Own 4-seat event: qty 5 → `400 "Only 4 seat(s) available, but 5 requested"`          | API   | E    |       |
| 12  | Own 4-seat event: qty 4 → `201`, `availableSeats` becomes 0, a further qty 1 → `400` | API   | E    |       |
| 13  | Booking decrements `availableSeats` by exactly the quantity                          | API   | P    |       |

Tests 11–13 are only deterministic because the event is ours. Against the shared
static events they would be flaky by design — seats moved during exploration.

### AC3 — the booking appears in My Bookings

| #   | Scenario                                                                            | Layer | Kind | Tag   |
| --- | ----------------------------------------------------------------------------------- | ----- | ---- | ----- |
| 14  | After booking, `/bookings` shows a card containing my reference, quantity and total | UI    | P    | **S** |
| 15  | `GET /bookings` contains my reference                                               | API   | P    | **S** |
| 16  | The foreign account's `GET /bookings` does **not** contain my reference             | API   | N    |       |
| 17  | Foreign `GET /bookings/{id}` → `403`; foreign `GET /bookings/ref/{ref}` → `403`     | API   | N    |       |
| 18  | `GET /bookings/ref/{ref}` as the owner returns the same booking                     | API   | P    |       |

All presence-based — "contains my reference", never "has one item" (ADR 0008).

### AC4 — cancel a booking

| #   | Scenario                                                                                                        | Layer | Kind                     | Tag   |
| --- | --------------------------------------------------------------------------------------------------------------- | ----- | ------------------------ | ----- |
| 19  | Cancel from the UI → confirmation dialog → card disappears, and `availableSeats` is restored (verified via API) | UI    | P                        | **S** |
| 20  | `DELETE /bookings/{id}` → `200`, and `availableSeats` increases by exactly the quantity                         | API   | P                        | **S** |
| 21  | **The foreign account cannot cancel my booking** → `404`, and my booking is still readable afterwards           | API   | N                        |       |
| 22  | Dismissing the confirmation dialog leaves the booking intact                                                    | UI    | N                        |       |
| 23  | A cancelled booking is gone, not retained with `status: cancelled`                                              | API   | `@characterization` (Q4) |       |
| 24  | Deleting the same booking twice → second call `404`                                                             | API   | `@characterization` (Q4) |       |

Test 21 is the single most important negative test in the suite: it is the one
that would catch a real authorization regression.

### AC5 — the same works through `POST /api/bookings`

| #   | Scenario                                                                                         | Layer | Kind | Tag   |
| --- | ------------------------------------------------------------------------------------------------ | ----- | ---- | ----- |
| 25  | Book via the **API**, then confirm the same reference and total appear in the **UI**             | cross | P    | **S** |
| 26  | Book via the **UI**, then confirm `GET /bookings` returns the same reference, quantity and total | cross | P    |       |
| 27  | Cancel via the **API**, then confirm the card is gone from the UI                                | cross | P    |       |

### Authentication and the no-auth contract

| #   | Scenario                                                                                                        | Layer | Kind | Tag   |
| --- | --------------------------------------------------------------------------------------------------------------- | ----- | ---- | ----- |
| 28  | `POST /bookings` with **no token** → `401`. Documents the US-114 "visitor" contradiction (`story-review.md` W1) | API   | N    | **S** |
| 29  | `GET /bookings`, `GET /events` with no token → `401`; with a malformed token → `401 "Invalid or expired token"` | API   | N    |       |
| 30  | An unauthenticated browser hitting `/events` is redirected to `/login`                                          | UI    | N    |       |
| 31  | `GET /health` and `GET /config` succeed with no token                                                           | API   | P    |       |

Tests 28–30 use the explicit anonymous opt-out
(`test.use({ storageState: ANONYMOUS_STORAGE_STATE })`), which is what keeps them
honest rather than accidentally authenticated (ADR 0004).

## Priorities

**`@smoke` — 8 tests.** One happy path per AC at each meaningful layer, plus the
`401` contract. The question it answers is _"is the booking flow alive?"_. Target
under 90 seconds.

**Everything — 31 tests.** Runs on **every push**; at this size there is no
reason to split. `@smoke` exists for fast local feedback and as the gate if the
suite grows past a couple of minutes.

Every test is also tagged `@AC1`…`@AC5`, so the Allure report groups by
acceptance criterion and answers _"is AC2 covered?"_ directly — which is the
traceability that justified Allure in the first place (ADR 0003).

## Why 31 and not 80

The suite is sized by **distinct risk**, not by counting permutations.

Each API validation rule is covered once, at the boundary. Each piece of UI
behaviour is covered once, in the browser. Authorization is covered from the one
angle that matters — a non-owner attempting access. Nothing is tested twice at
two layers, except the three AC5 parity tests, where the duplication **is** the
requirement.

What a bigger number would buy: more input permutations through the same code
path. The second malformed email tests the same validator as the first. That is
cost without coverage, and on a shared public environment it is also extra load
on someone else's server.

## Deliberately not automated

| Not doing                        | Why                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance / load testing**   | This is a shared public practice server used by other candidates. Load-testing it would degrade their work. Out of scope on ethical grounds, not technical ones.                                                                                                                    |
| **Rate-limit probing**           | Same reason — deliberately not probed in Phase 2 either.                                                                                                                                                                                                                            |
| **Last-seat race condition**     | _Feasible and worth it_: own 1-seat event, two parallel `POST`s, assert exactly one `201` and one `400`. Held back only because the expected behaviour is open question 11 — though "exactly one wins" is the only sane outcome either way. First candidate for the next iteration. |
| **Visual regression**            | No approved baseline exists, and a shared environment with changing inventory would make snapshots churn.                                                                                                                                                                           |
| **Cross-browser**                | Chromium only for now. It is a standard Next.js SPA with no browser-specific APIs in the booking flow; adding WebKit/Firefox is two config entries when the risk justifies the runtime.                                                                                             |
| **Accessibility audit**          | Phase 2 found duplicate `id` attributes, so there is likely more. A11y deserves its own pass with `axe`, not a side effect of functional tests. Raised as a defect instead.                                                                                                         |
| **Mobile viewports**             | No requirement in the story; the layout was not reviewed for mobile.                                                                                                                                                                                                                |
| **Email / SMS delivery**         | No visibility into either, and the story never states they should happen (gap G4).                                                                                                                                                                                                  |
| **Payment**                      | Does not exist anywhere in the product (gap G2).                                                                                                                                                                                                                                    |
| **`PUT /events`, admin screens** | Outside US-114. `POST`/`DELETE /events` are used as _test infrastructure_, not tested as features.                                                                                                                                                                                  |

## Reliability

No retries, no `waitForTimeout`, no skipped tests, no conditional assertions —
enforced by ESLint rather than by review (ADR 0005). Determinism comes from
owning the data: each test creates its own event, asserts by presence rather than
count, and cleans up through `ResourceTracker`.

If a test turns out to be genuinely flaky, the fix is the test or a reported
product defect — never a retry.
