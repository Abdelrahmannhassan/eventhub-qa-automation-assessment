# Project rules & coding standards

Binding rules for anyone — human or AI — contributing to this framework.
Architecture decisions and their reasoning live in `docs/adr/`.

## 1. Non-negotiables

1. **Never invent application behaviour.** No locator, endpoint, payload field
   or status code goes into this repository unless it has been observed in the
   running application or its API documentation. If something is unknown, verify
   it — do not guess and do not pattern-match from other projects.
2. **Never make a test pass artificially.** No retries added to mask failure, no
   `waitForTimeout`, no `test.skip` on a failing test, no `try/catch` that
   swallows an assertion, no `force: true` to defeat an element that is genuinely
   not interactable. If a test fails, either the test is wrong or the product is
   — find out which, and say so. (ADR 0005)
3. **Never commit secrets.** No credentials, tokens, cookies or personal data in
   tracked files, including in example snippets and git history. (ADR 0006)
4. **A failing test is a finding, not an obstacle.** If the application
   contradicts the user story, record it as a documented discrepancy. Do not
   rewrite the expectation to match the bug.

## 2. Layering rules

| Layer                    | May contain                                      | Must never contain              |
| ------------------------ | ------------------------------------------------ | ------------------------------- |
| `tests/**`               | scenario intent, assertions, test data choices   | locators, URLs, raw HTTP        |
| `src/ui/pages`           | locators, intent-level actions, state readers    | assertions, hardcoded test data |
| `src/api/clients`        | endpoints, headers, typed results, error mapping | assertions                      |
| `src/api/contracts`      | Zod schemas (types are inferred from them)       | logic                           |
| `src/fixtures`           | dependency injection, setup/teardown             | assertions                      |
| `src/config`, `src/core` | configuration, logging, generic utilities        | any application knowledge       |

Two rules carry most of the weight:

- **Assertions belong in tests.** A page object that asserts cannot be reused by
  a test with a different expectation, and its failure message describes the
  page object instead of the requirement.
- **Locators and URLs belong in the framework.** One markup change must have
  exactly one place to be fixed.

## 3. Authorization

Authorization is a framework concern (ADR 0004). A test must never log in.

- Sessions are acquired once per run by the `setup` project.
- UI tests inherit the session via `storageState`.
- API tests receive a pre-authenticated request context from a fixture.
- A test needing an anonymous session opts out explicitly:
  `test.use({ storageState: ANONYMOUS_STORAGE_STATE })`.

## 4. Locator strategy

Preference order — stop at the first that applies:

1. `getByRole(...)` with an accessible name — closest to how a user perceives
   the page, and resilient to markup churn.
2. `getByLabel` / `getByPlaceholder` for form fields.
3. `getByTestId` where the application provides stable test ids.
4. `getByText` for genuinely content-identified elements.
5. CSS as a last resort, **with a comment explaining why** 1–4 did not work.

Never use XPath, never chain positional indexes (`nth-child`), never depend on
generated class names.

## 5. Test authoring rules

- One scenario per `test`. No scenario depends on another test having run.
- Every test creates the data it needs and registers it for cleanup. No test
  relies on data a previous run left behind.
- Test names state the requirement, not the mechanics:
  `'AC2 — total price equals ticket price multiplied by quantity'`.
- Tag tests for selective execution and traceability: `@smoke`, `@regression`,
  `@AC1`.
- Use **web-first assertions** (`await expect(locator).toBeVisible()`), never a
  manual poll, and never assert on a value read before the UI settled.
- Prefer API calls for _arrange_ and _cleanup_; use the UI to verify
  user-facing behaviour. Do not drive twenty UI steps to reach the one screen
  under test.

## 6. Code style

- TypeScript `strict` everywhere. `any` is not allowed; use `unknown` and narrow.
- `async`/`await` only — never raw `.then()` chains.
- Named exports only (no `export default`), so symbols are greppable.
- Import through path aliases (`@api/*`, `@ui/*`), never `../../../`.
- Log through `src/core/logger.ts`; `console.*` is a lint error.
- Comments explain **why**, never what the code already says.

## 7. Definition of done

Before any commit:

```bash
npm run verify     # typecheck + lint + format check
npm test           # or the affected project
```

Also required:

- A new architectural decision has an ADR in `docs/adr/`.
- A discrepancy found in the application is written up in `docs/story-review.md`.
- No `.only`, no new `.skip`, no commented-out tests.
