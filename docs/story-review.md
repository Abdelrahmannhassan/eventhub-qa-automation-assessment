# US-114 story review

Review of the user story as handed to the team, based on what Phase 2 actually
observed in the application and its API. Every claim here traces to evidence in
**[`docs/api-findings.md`](api-findings.md)**.

## The story as given

> **US-114: Book tickets for an event**
>
> **As a** visitor to EventHub
> **I want to** book tickets for an event
> **So that** I can attend it.
>
> **AC1** — When I choose the number of tickets, enter my name, email and phone, and click **Confirm Booking**, my booking is created and I see a confirmation with a booking reference.
> **AC2** — The total price is the ticket price multiplied by the number of tickets.
> **AC3** — The booking appears in **My Bookings**.
> **AC4** — I can cancel a booking.
> **AC5** — The same works through the API using `POST /api/bookings`.

## Verdict

The story describes the right feature and the application largely implements it:
**all five acceptance criteria pass end to end**. The problem is not the product —
it is that the story is not a usable specification.

|                                                                                           | Count  |
| ----------------------------------------------------------------------------------------- | ------ |
| Statements that are **factually wrong**                                                   | 2      |
| Acceptance criteria that are **not testable as written**                                  | 3 of 5 |
| **Missing** requirements (behaviour the app has, or needs, that the story never mentions) | 17     |
| **Questions** for the Product Owner                                                       | 13     |

The single biggest issue: **the actor is wrong.** The story is written for a
"visitor", and no visitor flow exists.

---

## 1. What is wrong

### W1 — "As a visitor" is false

The application has **no unauthenticated path to booking at all**:

- `/` and `/events` redirect to `/login`
- `POST /api/bookings` returns `401 {"success":false,"error":"Unauthorized"}`
- every endpoint except `GET /health` and `GET /config` requires a bearer token

This is not a wording nit. It changes **who the feature is for**, and it decides
whether AC1 and AC5 describe a product defect or a story defect. The story also
contains no registration or login step, so as written it is unimplementable.

### W2 — AC5's reference to the API docs points at a wrong contract

AC5 says the flow must work "through the API". The only written API contract is
the published OpenAPI document, and it disagrees with the running API in **15
places** (see `api-findings.md` §7). Most damaging: it declares authentication on
**1 of its 14 operations**, so a client generated from it cannot authenticate at
all. "The same works through the API" has no trustworthy written target.

---

## 2. What is missing

Behaviour the application has, or clearly needs, that the story never mentions.

### Blocking gaps

| #      | Missing                             | Why it matters                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G1** | **Authentication and registration** | Mandatory in reality, absent from the story. Nothing states how a user obtains an account, that a 7-day JWT governs the session, or what happens when it expires.                                                                                                                    |
| **G2** | **Payment**                         | There is no payment step anywhere — not in the form, not in `POST /bookings`. Tickets are reserved for free. Either this is a deliberate "reserve, pay later" model, or the story is missing the single most important part of buying a ticket.                                      |
| **G3** | **Who the booking belongs to**      | The booking is owned by the **authenticated account** (`userId`), while `customerName`/`customerEmail`/`customerPhone` are free-text. Account A can book using a completely unrelated email — and that person can see nothing. "My booking" is ambiguous: the buyer or the attendee? |
| **G4** | **Confirmation delivery**           | AC1 says "I see a confirmation". It says nothing about an email or SMS. Since the form collects email _and_ phone, a reader assumes they are used for something. No evidence of either was observed.                                                                                 |

### Functional gaps

| #       | Missing                                  | Observed behaviour                                                                                                       |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **G5**  | Which event is being booked              | AC1 starts at "choose the number of tickets". Event selection is a precondition the story never states.                  |
| **G6**  | Quantity limits                          | App enforces **1–10** in UI (stepper disables) and API (`400`). Not in the story.                                        |
| **G7**  | Field validation rules                   | App enforces name ≥ 2 chars, phone ≥ 10 digits, valid email. Not in the story.                                           |
| **G8**  | Booking-reference format                 | Unspecified. The docs claim `EVT-XXXXXX`; reality is `^[A-Z]-[A-Z0-9]{6}$`. Nothing to assert against.                   |
| **G9**  | Currency                                 | UI renders `$`; data is Indian (Delhi/Mumbai venues). Never stated.                                                      |
| **G10** | Sold-out and insufficient-seat behaviour | App returns `400 "Only N seat(s) available, but M requested"`. Not in the story.                                         |
| **G11** | Seat release on cancellation             | App **does** restore seats (verified 2002 → 2004). This is important behaviour that no AC requires.                      |
| **G12** | Whether a cancellation record is kept    | App **hard-deletes**. The API schema advertises `status: "cancelled"`, which is therefore unreachable. No audit trail.   |
| **G13** | Cancellation policy                      | No deadline, no refund rules. A booking for a **past** event can still be cancelled.                                     |
| **G14** | Past / expired events                    | Events dated 2026-07-11 and 2026-10-20 appear under "Upcoming Events" and are bookable. Story is silent.                 |
| **G15** | Duplicate bookings                       | The same account can create many bookings for the same event (3 existed simultaneously during exploration). Intentional? |
| **G16** | Modifying a booking                      | Not possible — no endpoint, no UI. A user who picks the wrong quantity must cancel and rebook. Never mentioned.          |
| **G17** | Concurrency on the last seat             | The docs claim booking is atomic. The story makes no guarantee, and nothing defines what the loser of a race should see. |

### Non-functional gaps

None of the following are mentioned: **security/authorization** (the app correctly
blocks cross-account reads with `403` — valuable behaviour that no AC requires),
**pagination** (API defaults to 10 per page), **accessibility** (the app renders
duplicate `id` attributes on repeated cards, which is invalid HTML),
**performance**, **error-message requirements**, and **data retention**.

---

## 3. What is unclear

| #      | Phrase                          | Problem                                                                                                                                                                                                                                       |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U1** | AC5: _"The same works"_         | The vaguest sentence in the story. Same validation? Same response shape? Same totals? Same auth? And `POST /api/bookings` alone cannot satisfy AC3 or AC4 — those need `GET /bookings` and `DELETE /bookings/{id}`, which AC5 never mentions. |
| **U2** | AC3: _"appears in My Bookings"_ | What must appear? Immediately? In what order? The app shows reference, status, id, event, date, quantity, city, booking date and total — none of it required.                                                                                 |
| **U3** | AC4: _"I can cancel a booking"_ | "Cancel" is undefined. The app deletes the record and releases seats. Does the user keep proof? Is a refund owed? Who may cancel?                                                                                                             |
| **U4** | AC2: _"the ticket price"_       | API returns `price` as the **string** `"2500"`. Decimal handling, rounding and whether taxes or fees ever apply are all unspecified.                                                                                                          |
| **U5** | AC1: _"my booking is created"_  | See **G3** — created for the account or for the person in the form?                                                                                                                                                                           |
| **U6** | AC1: _"I see a confirmation"_   | Seen where? The app renders it inline on the event page, not on a separate confirmation route. Deep-linking or re-displaying it later is undefined.                                                                                           |

---

## 4. Questions for the Product Owner

Prioritised by how much the answer changes the product or the test suite.

### P1 — blocks a shared understanding of the feature

1. **Is "visitor" wrong, or is the application wrong?** Should an unauthenticated
   person be able to book, or should the story say "registered user"? _This
   decides whether AC1/AC5 are product defects or story defects._
2. **Where is payment?** Is free reservation the intended model, or is the payment
   step missing from both the story and the product?
3. **Who owns a booking — the account or the person in the form?** May I book on
   behalf of someone else? If yes, should that person be able to see or cancel it?
4. **Is a cancelled booking supposed to disappear?** The API schema implies a
   `cancelled` status, the implementation hard-deletes. Which is correct? If
   refunds or disputes are ever in scope, deletion loses the evidence.

### P2 — changes expected behaviour and therefore the tests

5. **Should past events be bookable, and should they show as "Upcoming"?**
6. **Is the 1–10 ticket limit a real business rule?** Per booking, or per user per
   event? Can the same user hold 10 bookings of 10 tickets each?
7. **What is the currency,** and can a ticket price ever have decimals?
8. **Is there a cancellation deadline or refund rule?**
9. **Should the confirmation also be emailed or texted?** If not, why are email
   and phone mandatory?
10. **What should the loser of a race for the last seat see?**

### P3 — specification quality

11. **What is the agreed booking-reference format?** Today the documented format
    and the real one disagree, so nothing can be asserted.
12. **Should the published API documentation be treated as the contract?** If yes,
    it needs 15 corrections before AC5 is meaningful (`api-findings.md` §7). If
    no, what is the contract?
13. **Should a user be able to change a booking's quantity** instead of
    cancelling and rebooking?

---

## 5. Assumptions taken so the work can continue

The brief asks us to assume sensibly, write it down and keep going. Each
assumption below is what the automation will encode **until the PO answers**.

| #      | Assumption                                                                                                                                                                                             | If it turns out to be wrong                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | "Visitor" means _registered, authenticated user_. Tests authenticate before booking.                                                                                                                   | AC1/AC5 become product defects: anonymous booking is required and currently returns `401`. The suite would then need failing tests that document the gap. |
| **A2** | The booking reference is asserted as **non-empty, unique, and matching `^[A-Z]-[A-Z0-9]{6}$`** — the observed format. The documented `EVT-XXXXXX` is reported as a documentation defect, not asserted. | If `EVT-` is the intended format, the product is wrong and the assertion must flip.                                                                       |
| **A3** | AC2 is verified on **numeric amounts only**, ignoring the currency symbol, with the API's string prices converted explicitly.                                                                          | If currency or decimal rules matter, assertions need extending — not rewriting.                                                                           |
| **A4** | "Cancel" means **the booking is gone from My Bookings and the seats return to the event**. Both are asserted.                                                                                          | If a `cancelled` record must be retained, the assertion inverts and this becomes a product defect.                                                        |
| **A5** | AC5's "the same" means **same validation rules, same resulting booking, same total** — verified by cross-layer tests (book via API → confirm in the UI, and the reverse).                              | A narrower reading only shrinks scope; nothing has to be thrown away.                                                                                     |
| **A6** | `customerEmail` normalisation (Gmail dots/`+suffix` stripped) is **current behaviour**, so tests assert the normalised value or deliberately use non-Gmail addresses.                                  | If it is a defect, the test factory is the only place that changes.                                                                                       |
| **A7** | Past-event bookability and the stale seat count are **reported as defects, not encoded as expected behaviour**. No test asserts that booking a past event is allowed.                                  | If intentional, we add explicit tests; nothing to undo.                                                                                                   |
| **A8** | Tests create **their own events** for price- and seat-dependent assertions rather than depending on the three shared static events.                                                                    | None — this is a test-design choice, independent of the answers.                                                                                          |

---

## 6. Testability of each AC as written

| AC      | Testable as written? | What is missing                                                                                          |
| ------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| **AC1** | Partly               | Reference format undefined; no failure behaviour; event selection unstated; actor wrong.                 |
| **AC2** | Mostly               | Clear arithmetic, but currency, decimals and whether fees apply are undefined.                           |
| **AC3** | Weakly               | "Appears" does not say what, where, or how fast.                                                         |
| **AC4** | Weakly               | "Cancel" has no defined outcome — the most important behaviour (seat release) is not required by the AC. |
| **AC5** | **No**               | "The same" is undefined, and the endpoints needed for AC3/AC4 parity are not named.                      |

---

## 7. Suggested rewrite

Offered as a concrete starting point for the refinement conversation — not as a
decision already taken. It splits one overloaded story and makes each AC
independently verifiable.

> ### US-114a — Book tickets for an event (registered user)
>
> **As a** registered EventHub user
> **I want to** book tickets for an event I have selected
> **So that** I can attend it.
>
> **Preconditions:** the user is signed in; the event exists and has at least one
> seat available.
>
> - **AC1** Given an event with `availableSeats ≥ n`, when I set the quantity to
>   `n` (1 ≤ n ≤ 10), provide a name (≥ 2 chars), a valid email and a phone
>   (≥ 10 digits), and confirm, then a booking is created and I see a
>   confirmation showing a booking reference matching `<FORMAT TBD — see Q11>`.
> - **AC2** The displayed total equals `ticket price × quantity`, in `<CURRENCY
TBD — see Q7>`, with no additional fees.
> - **AC3** Immediately after confirmation the booking appears in **My Bookings**
>   showing at least: reference, event title, quantity and total. Only the
>   booking's own account can see it.
> - **AC4** The event's `availableSeats` decreases by exactly the booked quantity.
> - **AC5** Attempting to book more seats than are available is rejected with a
>   message naming how many remain, and no booking is created.
> - **AC6** The same outcomes are reachable through the API: `POST /api/bookings`
>   to create, `GET /api/bookings` for AC3, with the same validation rules and
>   the same resulting totals. Requests without a valid bearer token are rejected
>   with `401`.
>
> ### US-114b — Cancel a booking
>
> - **AC1** As the owner, cancelling my booking removes it from **My Bookings**.
> - **AC2** The event's `availableSeats` increases by exactly the cancelled quantity.
> - **AC3** A user who does not own a booking cannot read or cancel it.
> - **AC4** `<Retention: deleted vs status=cancelled — TBD, see Q4>`
> - **AC5** `<Cancellation deadline and refund policy — TBD, see Q8>`

Three things changed: the actor is correct, each AC names an observable outcome,
and the genuinely open decisions are marked **TBD with a question reference**
instead of being silently invented.

---

## 8. Defects to raise against the application

Independent of the story's wording, these behaviours look wrong and should be
raised. Full evidence in `api-findings.md`.

| Severity   | Defect                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**   | The published OpenAPI document declares authentication on 1 of 14 operations; a generated client cannot authenticate (**M1**).                                                                                  |
| **High**   | `customerEmail` is silently rewritten — Gmail dots and `+suffix` stripped — and inconsistently, since `/auth/register` does not do it. A customer can receive tickets at an address they never typed (**M12**). |
| **Medium** | Cancellation hard-deletes the booking while the API advertises a `cancelled` status, so no cancellation record survives (**M11**).                                                                              |
| **Medium** | The event page does not refresh availability after a successful booking: UI showed `2000` while the API reported `1998` (**U2**).                                                                               |
| **Medium** | Past events are listed as "Upcoming Events" and can be booked (**S6/U3**).                                                                                                                                      |
| **Low**    | `quantity: "3"` as a string is accepted, contradicting the API's own "must be an integer" message (**M14**).                                                                                                    |
| **Low**    | Inconsistent authorization codes: non-owner `GET` returns `403`, non-owner `DELETE` returns `404` (**M10**).                                                                                                    |
| **Low**    | Duplicate `id` attributes on repeated cards — invalid HTML, harms accessibility and selector stability (**U6**).                                                                                                |
| **Low**    | The register page advertises a stricter password policy ("Min 8 chars, uppercase, number & symbol") than the API enforces (`minLength: 6`, no complexity) (**U1**).                                             |
