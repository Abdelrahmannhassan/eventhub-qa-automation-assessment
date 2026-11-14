# Test data

- `factories/` — build valid-by-default entities with unique values, and accept
  overrides for the one field a test actually cares about.

Unique data per test is what makes `fullyParallel` safe on a shared environment.
