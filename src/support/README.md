# Support

Cross-cutting test infrastructure.

- `cleanup/resource-tracker.ts` — registry of resources a test created, removed
  LIFO on teardown with failures isolated and reported rather than thrown.
- `assertions/` — domain-specific matchers, added when a expectation repeats
  often enough to deserve a name.
