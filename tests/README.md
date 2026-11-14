# Tests

Organised by layer, mapped to Playwright projects in `playwright.config.ts`:

| Directory     | Project        | Purpose                                             |
| ------------- | -------------- | --------------------------------------------------- |
| `tests/setup` | `setup`        | Runs first: validates config, prepares the session. |
| `tests/api`   | `api`          | Contract and behaviour of the REST API.             |
| `tests/ui`    | `ui-chromium`  | User-facing behaviour in the browser.               |
| `tests/e2e`   | `e2e-chromium` | Cross-layer journeys (act in UI, verify via API).   |

Which scenario belongs to which layer is decided in Phase 5 (`docs/test-strategy.md`).
