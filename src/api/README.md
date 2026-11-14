# API layer

Typed clients for the EventHub REST API.

- `clients/` — one client per resource (`bookings`, `events`, `auth`). Clients own
  URLs, headers and error mapping. They return typed data, never raw responses,
  and contain **no assertions**.
- `contracts/` — Zod schemas for request/response payloads. Types are inferred
  from the schemas, so compile-time types and runtime validation cannot drift.

Populated in Phase 2 once the real API surface has been inspected.
