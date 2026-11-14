# ADR 0001 — One unified Playwright + TypeScript framework for UI and API

**Status:** Accepted (Phase 1)

## Context

The assessment allows either _Playwright_ alone, or _Playwright (TypeScript) +
RestAssured (Java)_. We must automate one flow across both a web UI and a REST
API, and the framework must remain pleasant to extend for years.

## Decision

A single Playwright + TypeScript project covering both layers, using
Playwright's built-in `APIRequestContext` for HTTP and its browser automation
for the UI. UI and API are separated by **Playwright projects** and by source
layering, not by separate repositories or toolchains.

## Alternatives considered

**Playwright (TS) + RestAssured (Java).** Rejected. It would mean two build
systems (npm + Maven), two dependency trees, two reporting pipelines, two CI
jobs, and two languages for a team to stay fluent in — for a single booking
flow. The decisive argument is cross-layer testing: AC5 asks whether the API
does the same thing as the UI, and an end-to-end check like _"book through the
UI, confirm through the API, clean up through the API"_ is trivial in one
process and awkward across two runtimes. RestAssured is excellent, but here its
cost is structural and its benefit is duplicated by `APIRequestContext`.

**Playwright for UI + a separate JS HTTP library (axios/supertest).** Rejected.
It adds a dependency and a second request/retry/auth configuration surface for
capability Playwright already ships, and it loses automatic attachment of API
calls to the Playwright trace.

## Consequences

Good: one `npm install`, one runner, one report, one set of fixtures; API
helpers are reusable as _setup and teardown_ for UI tests (fast arrange, honest
assert); shared authorization for both layers.

Bad / accepted: we lose RestAssured's expressive given/when/then DSL, so API
readability now depends on our own client design (addressed in ADR 0002). We are
also tied to Playwright's HTTP client, which is less specialised than
RestAssured for exotic needs (XML, complex multipart).

**Interview note:** the honest summary is _"two tools would be a defensible
choice on a large organisation boundary — separate teams owning API and UI. For
one flow, one team, and a cross-layer acceptance criterion, the integration cost
buys nothing."_
