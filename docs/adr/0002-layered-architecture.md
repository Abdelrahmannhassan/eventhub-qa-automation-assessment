# ADR 0002 — Layered source structure with path aliases

**Status:** Accepted (Phase 1)

## Context

"The framework should be able to grow over time… as if a team will keep adding to
it for the next couple of years." That requirement is about _change cost_: when
the markup moves, when an endpoint changes, when a new flow arrives, how many
files must a contributor touch, and can two contributors work without colliding?

## Decision

Source lives in `src/` (framework) and tests in `tests/` (intent). Each
directory owns exactly one responsibility:

| Path                 | Responsibility                                  | Must NOT contain         |
| -------------------- | ----------------------------------------------- | ------------------------ |
| `src/config`         | Resolve + validate configuration                | app knowledge            |
| `src/core`           | Cross-cutting utilities (logging, redaction)    | app knowledge            |
| `src/api/clients`    | HTTP calls per resource, typed results          | assertions               |
| `src/api/contracts`  | Zod schemas; types inferred from them           | logic                    |
| `src/ui/pages`       | Locators + intent-level page actions            | assertions, test data    |
| `src/ui/components`  | Widgets shared across pages                     | page-specific logic      |
| `src/auth`           | Credentials → session, session persistence      | per-test logic           |
| `src/data/factories` | Valid-by-default unique entities with overrides | requests                 |
| `src/fixtures`       | Dependency injection into tests; teardown       | assertions               |
| `src/support`        | Cleanup tracking, custom matchers               | app knowledge            |
| `tests/**`           | Scenario intent and assertions **only**         | locators, URLs, raw HTTP |

The rule that makes this hold: **assertions live only in tests; locators and
URLs live only in the framework.** A markup change has one place to be fixed; a
new scenario is a new file that touches nothing existing.

TypeScript path aliases (`@api/*`, `@ui/*`, …) are configured so imports stay
stable when files move, instead of degenerating into `../../../`.

## Alternatives considered

**Flat `tests/` + helpers.** Fine for ten tests, unmaintainable at a hundred:
duplicated locators and no obvious home for new code.

**Page Objects with built-in assertions (fat POs).** Rejected: the same page
method then needs a variant per expectation, and failure messages describe the
page object rather than the requirement. Assertions belong where intent lives.

**Screenplay pattern.** More ceremony (actors, tasks, questions) than this
codebase size justifies; Page Objects plus fixtures gets most of the benefit at a
fraction of the onboarding cost.

## Consequences

Good: predictable file placement, low merge-conflict surface, cheap markup
changes, reviewable diffs.

Bad / accepted: more files and one indirection between a test and an HTTP call;
contributors must learn the layering rules (documented in `CLAUDE.md` and
partially enforced by lint).
