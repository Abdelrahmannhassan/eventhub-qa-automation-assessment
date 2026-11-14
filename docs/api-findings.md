# EventHub — Phase 2 exploration findings

**Date:** 2026-11-14 · **Environment:** shared public production
(`https://eventhub.rahulshettyacademy.com`, API `https://api.eventhub.rahulshettyacademy.com/api`)

Everything below was **observed**, not assumed. Nothing in this document comes
from inference about how a booking API "usually" works (`CLAUDE.md` §1).

## How this was gathered

| Method                                                                                                               | What it produced                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| OpenAPI spec extracted from the Swagger UI bundle (`/api/docs/swagger-ui-init.js`; there is no `docs-json` endpoint) | The documented contract — 14 operations, schemas, declared security            |
| Scripted HTTP requests (Node `fetch`), unauthenticated and as two separate accounts                                  | Real status codes, payloads, validation messages, authorization behaviour      |
| Headed Chromium driven by Playwright, with every request/response to `api.eventhub…` captured                        | The real UI flow, the actual DOM, and what the UI sends vs what the API stores |

Two throwaway accounts were registered for this (`…+ehA@gmail.com` id `21497`,
`…+ehB@gmail.com` id `21498`). Passwords are random, unique, stored only in the
git-ignored `.env`, and never logged (ADR 0007). **All bookings created during
exploration were deleted; event 284 seat count was returned to its original 2004.**

---

## 1. Authentication

| Property               | Observed value                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Mechanism              | **JWT bearer token** — `Authorization: Bearer <token>`                                                                                          |
| Issued by              | `POST /auth/register` → `201`, `POST /auth/login` → `200`; both return `{ success, token, user:{id,email} }`                                    |
| Claims                 | `{ userId, email, iat, exp }`                                                                                                                   |
| **Lifetime**           | **Exactly 168 hours (7 days)** — measured from `exp - iat` on two separate tokens                                                               |
| Refresh                | **No refresh endpoint exists.** Re-login is the only renewal path                                                                               |
| **Email verification** | **None.** `POST /auth/register` returns a usable token immediately                                                                              |
| Web app storage        | `localStorage` key **`eventhub_token`** (no cookie session). Logout clears all of `localStorage` and redirects to `/login`                      |
| Token validation       | `GET /auth/me` → `200` with claims; malformed token → `401 {"error":"Invalid or expired token"}`; absent token → `401 {"error":"Unauthorized"}` |

**Everything requires authentication except `GET /health` and `GET /config`.**
Verified by calling every booking and event endpoint with no token — all returned
`401 {"success":false,"error":"Unauthorized"}`.

## 2. Per-account data isolation — verified

| Probe (as account B against account A's data) | Result                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /bookings`                               | `200` with `data: []` — B sees only its own bookings                                          |
| `GET /bookings/{id}` (A's booking)            | `403 "You are not authorized to view this booking"`                                           |
| `GET /bookings/ref/{ref}` (A's booking)       | `403 "You do not own this booking"`                                                           |
| **`DELETE /bookings/{id}` (A's booking)**     | **`404 "Booking with id 62258 not found"` — and A's booking was confirmed intact afterwards** |
| `GET /events/{id}` (an event A created)       | `404`                                                                                         |
| `DELETE /events/{id}` (an event A created)    | `404`                                                                                         |

**Answer to "can user A cancel user B's booking?" — No.** Cross-account
cancellation is correctly prevented. See mismatch **M10** for the inconsistent
status code.

Events split into two kinds:

- **3 shared static events** (`isStatic: true`, `userId: null`) — visible to every
  account: `285 Dilli Diwali Mela` ($300), `284 Hollywood Monsoon Night — Los
Angeles` ($2,500), `283 World Tech Summit`.
- **User-created events** (`POST /events` → `isStatic: false`, `userId` set) —
  private to the creating account; another account gets `404`. This is the
  "fully isolated sandbox" the docs describe, and it applies only to
  user-created data.

## 3. Endpoint inventory

| Method & path             | Documented            | Auth required (observed) | Notes                                                                                                                |
| ------------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `GET /health`             | yes                   | no                       | `{status, timestamp, dbStatus}`                                                                                      |
| `GET /config`             | yes                   | no                       | `{showExploreLinks:false}`                                                                                           |
| `POST /auth/register`     | yes                   | no                       | `201` + token                                                                                                        |
| `POST /auth/login`        | yes                   | no                       | `200` + token                                                                                                        |
| `GET /auth/me`            | yes                   | **yes**                  | only operation the spec marks as secured                                                                             |
| `GET /events`             | yes                   | yes                      | paginated; UI calls `?page=1&limit=12` and `?limit=6`                                                                |
| `GET /events/{id}`        | yes                   | yes                      |                                                                                                                      |
| `POST /events`            | yes                   | yes                      | creates a private event                                                                                              |
| `PUT /events/{id}`        | yes                   | yes                      | not exercised                                                                                                        |
| `DELETE /events/{id}`     | yes                   | yes                      | owner `200`, non-owner `404`                                                                                         |
| `GET /bookings`           | yes                   | yes                      | **caller's own bookings only**                                                                                       |
| `POST /bookings`          | yes                   | **yes**                  | the AC5 endpoint                                                                                                     |
| `GET /bookings/{id}`      | yes                   | yes                      | non-owner `403`                                                                                                      |
| `GET /bookings/ref/{ref}` | yes                   | yes                      | non-owner `403`                                                                                                      |
| `DELETE /bookings/{id}`   | yes                   | yes                      | hard delete, restores seats                                                                                          |
| **`DELETE /bookings`**    | **NO — undocumented** | yes                      | **Bulk "clear all". Used by the UI's "Clear all bookings" button; returns `200 {"message":"3 booking(s) cleared"}`** |

## 4. `POST /bookings` — the real contract

**Request** (exactly what the UI sends, captured from the network):

```json
{
  "customerName": "QA Automation UI",
  "customerEmail": "ui.probe+UITAG@gmail.com",
  "customerPhone": "+201000000005",
  "quantity": 2,
  "eventId": 284
}
```

**Response `201`** — note the field names and types:

```json
{ "success": true,
  "data": { "id": 62298, "eventId": 284, "userId": 21497,
            "customerName": "QA Automation UI",
            "customerEmail": "uiprobe@gmail.com",
            "customerPhone": "+201000000005",
            "quantity": 2, "totalPrice": "5000", "status": "confirmed",
            "bookingRef": "H-Z91U0V",
            "createdAt": "...", "updatedAt": "...", "event": { ...full event... } },
  "message": "Booking confirmed!" }
```

- `totalPrice` is a **string**, and `event.price` is a **string** — both documented as `number`.
- `bookingRef` observed values: `H-QUIYBH`, `H-Z91U0V`, `H-RFLW2Y`, `Q-ZXPAL4`.
  Pattern is **`^[A-Z]-[A-Z0-9]{6}$`**, where the letter matches the event
  title's initial (Hollywood → `H`, QA Automation… → `Q`). The docs claim `EVT-XXXXXX`.
- `customerEmail` came back **`uiprobe@gmail.com`** although
  `ui.probe+UITAG@gmail.com` was sent — see **M12**.
- `userId` is returned but is absent from the documented `Booking` schema.

### Validation observed on `POST /bookings`

| Input                                  | Status               | Message                                                   |
| -------------------------------------- | -------------------- | --------------------------------------------------------- |
| `quantity: 0` / `11` / `99999` / `1.5` | `400`                | `Quantity must be an integer between 1 and 10`            |
| **`quantity: "3"` (string)**           | **`201` — accepted** | silently coerced to `3`                                   |
| `customerName: "A"`                    | `400`                | `Customer name must be at least 2 characters`             |
| `customerPhone: "123"`                 | `400`                | `Customer phone must be at least 10 digits`               |
| `customerEmail: "nope"`                | `400`                | `Customer email must be a valid email address`            |
| `eventId: 999999999`                   | `404`                | `Event with id 999999999 not found`                       |
| `{}`                                   | `400`                | one `details[]` entry per rule, with duplicates per field |
| qty 5 on a 4-seat event                | `400`                | `Only 4 seat(s) available, but 5 requested`               |
| qty 1 on a sold-out event              | `400`                | `Only 0 seat(s) available, but 1 requested`               |

Validation errors return `{success:false, error:"Validation failed", details:[{field,message}]}`.
Business errors (insufficient seats) return `{success:false, error:"…"}` with **no
`details` array** — two different `400` shapes.

`POST /auth/register` / `login` validation: email format required; password
`minLength 6` with **no complexity rules** (`12345` → `400`, `abc123` accepted).
Login with an unknown email → `400 "Invalid email or password"` (no user
enumeration — good, but not what the docs say).

## 5. Acceptance criteria — verified end to end

| AC                                            | Result                       | Evidence                                                                                                                                     |
| --------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC1** booking + confirmation with reference | **Works**                    | UI shows `Booking Confirmed! 🎉`, `Booking Ref H-Z91U0V`, customer, tickets, total — rendered inline on `/events/{id}`, not a separate route |
| **AC2** total = price × quantity              | **Works**                    | $2,500 unit: qty 1→$2,500, 2→$5,000, 3→$7,500, 4→$10,000, 10→$25,000. Line item reads `$2,500 × 2 tickets`. API `totalPrice` agrees          |
| **AC3** appears in My Bookings                | **Works**                    | `/bookings` shows card with ref, `confirmed`, `#62298`, event, qty, total                                                                    |
| **AC4** cancel                                | **Works**                    | In-page dialog → `DELETE /api/bookings/62413` → `200` → card gone, `No bookings yet`, **seats restored 2002 → 2004**                         |
| **AC5** same via `POST /api/bookings`         | **Works, but requires auth** | `201` with identical semantics; `401` without a token                                                                                        |

Quantity bounds are enforced in the UI by **disabling** the stepper buttons:
`−` disabled at 1, `+` disabled at 10, with `(max 10)` shown.

## 6. UI structure (for Page Objects)

Routes: `/login`, `/register`, `/` (home), `/events`, `/events/{id}`,
`/bookings` (labelled "My Bookings"), `/admin/events`.
**Unauthenticated access to `/` or `/events` redirects to `/login`.**

| Element                         | Locator observed                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login email / password / submit | `input[name="email"]`, `input[name="password"]`, button `Sign In`                                                                                          |
| Register                        | `data-testid="register-email"`, `register-password`, `register-btn`; a **Confirm Password** input with no id/testid (`placeholder="Repeat your password"`) |
| Nav                             | `nav-home`, `nav-events`, `nav-bookings`, `logout-btn`, `user-email-display`                                                                               |
| Event list card / CTA           | `data-testid="event-card"`, `data-testid="book-now-btn"` (an `<a href="/events/{id}">`, not a button)                                                      |
| Quantity                        | `#ticket-count` (a `<span>`), buttons `+` and `−` (**U+2212 minus**, not a hyphen)                                                                         |
| Booking form                    | `#customerName` (`name="customerName"`), `data-testid="customer-email"` (`name="customerEmail"`), `#phone` (**`name="phone"`**), `#confirm-booking`        |
| Booking list                    | `data-testid="booking-card"`, `booking-id`, `cancel-booking-btn`                                                                                           |
| Cancel confirmation             | `data-testid="confirm-dialog-yes"` ("Yes, cancel it") + a `Cancel` button                                                                                  |
| Clear all                       | button `Clear all bookings` → native `window.confirm` → `DELETE /api/bookings`                                                                             |

The booking `<form>` carries `novalidate`, so the app owns all validation.

---

## 7. Mismatches

### Documentation vs actual API behaviour

| #       | Mismatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1**  | **Security is undeclared on 13 of 14 operations.** The spec defines `bearerAuth` but attaches it only to `GET /auth/me`, with no global `security`. Reality: every endpoint except `/health` and `/config` returns `401` without a token. Anyone generating a client from this spec would produce a client that cannot work.                                                                                                                                                                                      |
| **M2**  | `GET /bookings` is documented as _"Returns a paginated list of **all** bookings"_. It actually returns only the caller's bookings — and the `POST /auth/register` description simultaneously promises a _"fully isolated sandbox"_. The two statements contradict each other; the isolating behaviour is the correct one.                                                                                                                                                                                         |
| **M3**  | `POST /auth/login` with an unknown email: documented `404 "User not found"`, actual `400 "Invalid email or password"`.                                                                                                                                                                                                                                                                                                                                                                                            |
| **M4**  | `Booking.totalPrice` documented as `number/float`, returned as a **string** (`"5000"`).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **M5**  | `Event.price` documented as `number/float`, returned as a **string** (`"2500"`) — even when submitted as a number (`150` → `"150"`).                                                                                                                                                                                                                                                                                                                                                                              |
| **M6**  | `bookingRef` documented as `EVT-A1B2C3` / _"EVT-XXXXXX"_; actual format is `^[A-Z]-[A-Z0-9]{6}$` (e.g. `H-Z91U0V`).                                                                                                                                                                                                                                                                                                                                                                                               |
| **M7**  | Undocumented response fields: `Booking.userId`; `Event.isStatic`, `Event.userId`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **M8**  | `403` is not documented anywhere, yet it is returned for non-owner reads of a booking.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **M9**  | **`DELETE /bookings` (bulk clear) is entirely absent from the spec** but exists, works, and is used by the application itself.                                                                                                                                                                                                                                                                                                                                                                                    |
| **M10** | Inconsistent authorization codes for the same resource: non-owner `GET /bookings/{id}` → `403`, non-owner `DELETE /bookings/{id}` → `404`.                                                                                                                                                                                                                                                                                                                                                                        |
| **M11** | `Booking.status` documents the enum `confirmed \| cancelled`, but cancellation is a **hard delete** (`GET` by ref afterwards → `404`). The value `cancelled` appears to be unreachable.                                                                                                                                                                                                                                                                                                                           |
| **M12** | **`customerEmail` is silently rewritten and this is undocumented.** Gmail/googlemail addresses have dots and `+suffix` stripped and are lowercased; other domains are only lowercased. Verified: `First.Last+tag99@gmail.com` → `firstlast@gmail.com`; `a.b.c@googlemail.com` → `abc@gmail.com`; `First.Last+tag99@example.com` → `first.last+tag99@example.com`. **`POST /auth/register` does _not_ normalise** (`…+ehA@gmail.com` was stored verbatim), so the rule is applied inconsistently across endpoints. |
| **M13** | Two different `400` body shapes: validation errors include `details[]`, business errors (insufficient seats) do not. The documented `400` for `POST /bookings` has an empty schema.                                                                                                                                                                                                                                                                                                                               |
| **M14** | `quantity: "3"` (string) is accepted and coerced, contradicting the API's own message _"Quantity must be an integer between 1 and 10"_.                                                                                                                                                                                                                                                                                                                                                                           |
| **M15** | Empty-body validation returns duplicate `details[]` entries for the same field (e.g. `eventId` reported both _"is required"_ and _"must be a positive integer"_).                                                                                                                                                                                                                                                                                                                                                 |

### Application vs the user story (US-114)

| #      | Mismatch                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S1** | **"As a _visitor_ to EventHub I want to book tickets" is false.** The entire application is behind authentication: `/` and `/events` redirect to `/login`, and `POST /api/bookings` returns `401`. A visitor cannot browse events, let alone book. The story has no registration or login step at all. |
| **S2** | The story never defines the booking-reference format; the only written format (`EVT-XXXXXX`, in the API docs) is wrong. There is no agreed expectation to test against.                                                                                                                                |
| **S3** | AC4 says "I can cancel a booking" but not what cancellation _means_. The implementation hard-deletes the record and releases the seats; no cancellation record is retained, and no policy limits when cancelling is allowed.                                                                           |
| **S4** | The 1–10 tickets-per-booking cap is enforced in both UI and API but is absent from the story.                                                                                                                                                                                                          |
| **S5** | Currency is undefined in the story. The UI renders `$` while the data is clearly Indian (Delhi / Mumbai venues, ₹-scale prices).                                                                                                                                                                       |
| **S6** | **Past events are listed as "Upcoming Events" and are bookable.** Event 284 is dated 2026-07-11 and event 285 2026-10-20 — both in the past as of 2026-11-14 — and a booking on 284 succeeded. The story says nothing about event dates.                                                               |
| **S7** | AC2's "ticket price" is a string in the API, so "multiplied by" requires a type conversion the story does not acknowledge.                                                                                                                                                                             |

### UI vs API

| #      | Mismatch                                                                                                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U1** | The register page advertises **"Min 8 chars, uppercase, number & symbol"** and offers a **Confirm Password** field. The API enforces only `minLength: 6` with no complexity rule and has no concept of password confirmation. The policies are not the same.                                    |
| **U2** | **The event page does not refresh availability after a successful booking.** Measured: page showed `2000 / 3000 seats` before and after booking 2 tickets, while the API reported `1998`.                                                                                                       |
| **U3** | Past events appear under the heading "Upcoming Events" (see **S6**).                                                                                                                                                                                                                            |
| **U4** | Inconsistent confirmation patterns: cancelling one booking uses a custom in-page dialog (`confirm-dialog-yes`); "Clear all bookings" uses a native `window.confirm`.                                                                                                                            |
| **U5** | The phone input is `name="phone"` while the API field is `customerPhone` (the client maps it). Not a defect — a note for locator design.                                                                                                                                                        |
| **U6** | **Duplicate `id` attributes** are rendered for repeated rows: `id="event-card"`, `id="book-now-btn"`, `id="booking-card"`, `id="cancel-booking-btn"` each appear once per card. This is invalid HTML and makes `#id` selectors unreliable — tests must use `data-testid` with explicit scoping. |

---

## 8. Open questions

Recorded rather than guessed. The ones that affect AC interpretation go to the
Product Owner in Phase 3 (`docs/story-review.md`).

1. **Is the "visitor" wording in US-114 wrong, or is the application wrong?** This
   decides whether AC1/AC5 describe a defect or the story needs rewriting.
2. Should cancelled bookings be **retained** with `status: "cancelled"` (as the
   schema implies) instead of hard-deleted?
3. Is `DELETE /bookings` (bulk) an intentional, supported endpoint, or a test
   convenience that leaked into production? Should tests rely on it?
4. Should **past events** be bookable, and should they appear under "Upcoming Events"?
5. What is the intended **currency**?
6. Is the **1–10** ticket cap a real business rule, and is it per booking or per user?
7. Is the **email normalisation** intentional? If so, why does `/auth/register`
   not apply it? Which value is authoritative for contacting the customer?
8. Does the UI actually **block** a 6-character password client-side? The page
   shows a static requirements checklist and the submit button remained enabled
   in all three probes; this was not resolved without creating accounts, so it is
   left open rather than asserted.
9. Is `totalPrice`/`price` being a **string** intentional (decimal precision) or a
   serialisation accident? Tests must know which to assert.
10. Is there **rate limiting**? Not probed, to avoid degrading a shared environment.
11. Is there any **concurrency** guarantee? The docs claim booking is atomic; two
    simultaneous bookings for the last seat were not tested yet.

---

## 9. What this means for the framework

| Finding                                                                                     | Design consequence                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT in `localStorage.eventhub_token`; API uses `Authorization: Bearer`                      | **One token serves both layers.** `AuthManager` can acquire a token over HTTP and write it into Playwright `storageState` as a `localStorage` origin entry — no browser login needed. Fast and centralised (ADR 0004).                          |
| No email verification; registration returns a token instantly                               | **Per-worker self-registered accounts are viable**, giving true isolation on a shared environment instead of contending over one shared login.                                                                                                  |
| 7-day token lifetime, no refresh                                                            | A session acquired once per run is safe for any realistic run length. Re-login on `401` remains the fallback.                                                                                                                                   |
| User-created events are private per account                                                 | **Tests can create their own event** with a controlled price and seat count, book against it, and never collide with other candidates or with the three shared static events. This is the key to deterministic AC2 and insufficient-seat tests. |
| `DELETE /bookings/{id}` works and restores seats                                            | Cleanup is reliable per resource; the `ResourceTracker` registers each booking and event at creation. Bulk `DELETE /bookings` exists as a fallback but is undocumented, so it should not be the primary mechanism (open question 3).            |
| `price`/`totalPrice` are strings                                                            | Zod contracts must model them as strings and convert explicitly for arithmetic. Asserting `toBe(7500)` against `"7500"` would fail for the wrong reason.                                                                                        |
| `customerEmail` is rewritten server-side                                                    | Tests must assert against the **normalised** expectation, or deliberately use a non-Gmail domain. This is exactly the kind of trap a factory should encapsulate.                                                                                |
| Duplicate DOM ids; good `data-testid` coverage on containers but none on the booking inputs | Locator strategy: `getByTestId` where provided, `getByLabel`/`name` for the booking form, always scoped to a card locator rather than `#id`.                                                                                                    |
| Everything needs auth; `/health` and `/config` do not                                       | A fast unauthenticated smoke check is possible, and negative auth tests have a clear `401` contract to assert.                                                                                                                                  |
