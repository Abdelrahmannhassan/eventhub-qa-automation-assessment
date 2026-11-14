# ADR 0009 — Lenient clients, strict contract tests

**Status:** Accepted (Phase 6b). Supersedes the Phase 6a decision to validate
strictly everywhere.

## Context

Phase 6a validated every response with `.strict()` Zod schemas inside the API
clients, so an unrecognised key failed the call. That immediately proved its
worth: it caught an undocumented `message` field on `POST /events` that my own
model of the API had missed.

But it also created a fragility that only shows up later. EventHub is a
**third-party service we do not control**. If its maintainers add one harmless
field to the event payload, strict-everywhere means **every flow test that
touches an event fails at once** — thirty red tests, none of which is about a
booking defect. The suite would be reporting "the API added a field" as if the
booking flow were broken, and the signal that matters would be buried.

That is the wrong failure mode: additive change is normal and backward
compatible, and the response to it should be one informative failure, not a
blanket outage.

## Decision

Each contract exists in **two modes**, built from one shape definition so they
cannot drift:

| Mode        | Built with              | Unknown keys | Used by                                    |
| ----------- | ----------------------- | ------------ | ------------------------------------------ |
| **Lenient** | `z.object(shape)`       | stripped     | API clients, and therefore every flow test |
| **Strict**  | `z.strictObject(shape)` | **error**    | only `tests/api/contracts/*.spec.ts`       |

Flow tests still get real validation — types, formats, the `bookingRef` pattern,
the money-string pattern, enum values, required fields. What they no longer do is
fail because a _new_ field appeared.

The dedicated contract tests validate the **raw body** (`ApiResult.body`, which
is always exposed unparsed) against the strict schemas. Their whole job is to
notice shape change, and when the API adds a field exactly **one** test goes red,
with the field named in the failure message.

Sharing a single `shape` object between the two modes is the part that makes this
safe: there is no way to tighten one and forget the other.

## Alternatives considered

**Strict everywhere (the Phase 6a behaviour).** Maximum detection, unacceptable
blast radius on a service we do not own. Rejected on the failure-mode argument
above.

**Lenient everywhere.** Simple and stable, but then nothing ever notices that the
API changed shape — and discovering the `message` field by accident showed how
easily a wrong model survives. Rejected: it discards a real signal.

**Strict in clients with an allow-list of tolerated new keys.** Keeps detection
in the clients, but the allow-list has to be maintained by hand, grows silently,
and ends up disabling the check it is meant to scope. Rejected as the worst of
both.

**A separate consumer-driven contract tool (Pact).** The right answer when both
sides of the contract are yours and can be verified in each other's CI. Here
there is no provider-side CI to participate, so it would be ceremony without the
guarantee.

## Consequences

Good: additive API change costs one clear failure instead of thirty misleading
ones; flow tests fail only for behavioural reasons; shape drift is still detected
and attributed.

Bad / accepted: a shape change is now caught by a smaller number of tests, so if
someone deletes the contract specs the detection disappears with them — hence
their own directory and a note in the strategy. Each contract is also written
twice at the envelope level (though never twice at the field level).

**Interview note:** the useful framing is that strictness is not a virtue in
itself — it is a choice about **who should be interrupted when something
changes**. For an API you own, strict everywhere is reasonable because you can
fix the provider. For a third party, strict everywhere means their routine
release becomes your outage, so you concentrate strictness in the tests whose
purpose is to detect exactly that.
