# Fixtures

The seam between tests and the framework.

Tests import `test`/`expect` from here instead of `@playwright/test`. Fixtures
inject pre-authenticated API clients, Page Objects and the resource tracker, and
run cleanup on teardown — which is how authorization and teardown stay out of
individual tests.

Populated in Phase 6 (shape depends on the Phase 2 auth findings).
