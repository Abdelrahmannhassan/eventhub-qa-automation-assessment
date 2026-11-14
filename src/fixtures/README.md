# Fixtures

The seam between tests and the framework.

Tests import `test` and `expect` from here, never from `@playwright/test`.

| Fixture                                                         | Scope  | Provides                                                             |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `workerSession`                                                 | worker | One sign-in per worker, for the account assigned by worker index     |
| `workerStorageState`                                            | worker | That session written as a storage-state file (JWT in `localStorage`) |
| `storageState`                                                  | test   | Overrides Playwright's own option so the browser opens signed in     |
| `api`                                                           | test   | API clients acting as the worker's account                           |
| `foreignApi`                                                    | test   | API clients acting as a different account (authorization tests)      |
| `anonymousApi`                                                  | test   | API clients with no credentials (the `401` cases)                    |
| `tracker`                                                       | test   | `ResourceTracker`; cleanup runs automatically on teardown            |
| `loginPage`, `eventsPage`, `eventDetailsPage`, `myBookingsPage` | test   | Page Objects                                                         |

This is how authorization and teardown stay out of individual tests (ADR 0004).
