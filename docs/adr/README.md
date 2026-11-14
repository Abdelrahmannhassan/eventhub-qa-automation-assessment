# Architecture Decision Records

One file per significant decision, written when the decision is made.

Each record states the **context**, the **decision**, the **alternatives we
rejected**, and the **consequences** (including the bad ones). The goal is that
someone joining this framework in a year can understand _why_ it looks the way
it does without asking us — and can overturn a decision knowingly.

| ADR                                       | Decision                                           | Status            |
| ----------------------------------------- | -------------------------------------------------- | ----------------- |
| [0001](0001-single-unified-framework.md)  | One Playwright + TypeScript framework for UI & API | Accepted          |
| [0002](0002-layered-architecture.md)      | Layered source structure with path aliases         | Accepted          |
| [0003](0003-reporting-stack.md)           | Playwright HTML + JUnit + Allure                   | Accepted          |
| [0004](0004-centralised-authorization.md) | Authorization owned by the framework               | Accepted (design) |
| [0005](0005-reliability-policy.md)        | Zero retries, no hardcoded waits, lint-enforced    | Accepted          |
| [0006](0006-configuration-and-secrets.md) | Validated config object, secrets never in git      | Accepted          |
