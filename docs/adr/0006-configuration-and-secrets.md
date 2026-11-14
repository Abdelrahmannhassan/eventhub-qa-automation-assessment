# ADR 0006 — Configuration resolution and secret handling

**Status:** Accepted (Phase 1)

## Context

The same suite must run on a laptop and in GitHub Actions against a shared public
environment, and the repository is **public** — a leaked credential is leaked to
everyone, permanently, including in git history.

## Decision

**One validated configuration object.** `src/config/env.ts` loads `.env`,
validates everything with a Zod schema, and exports a frozen `config`. Nothing
else in the framework reads `process.env`.

Resolution order: explicit environment variable → named-environment default.
Environments live in a map, so adding staging is a one-line change and every
consumer keeps reading `config.baseUrl`.

**Invalid configuration fails immediately**, at import time, with a message that
names the offending variable — instead of surfacing later as a confusing 404.
Likewise, `requireSharedAccountCredentials()` fails with instructions rather than
letting a missing password become an unexplained 401.

**Secrets never enter git.**

- `.env` is git-ignored; only `.env.example` (placeholders, no values) is tracked.
- `.auth/` — real session cookies — is git-ignored.
- The logger redacts any key matching `pass|token|secret|authorization|cookie|apikey`,
  because CI logs on a public repository are world-readable.
- In CI, values arrive as **GitHub Actions secrets** (sensitive) and **variables**
  (non-sensitive, e.g. base URLs), injected as environment variables for the test
  step only. Wired in Phase 7.
- Commits use the GitHub `users.noreply` address so no personal email address is
  published in the public history.

## Alternatives considered

**Reading `process.env` directly where needed.** Zero infrastructure, but
typos fail silently as `undefined`, there is no single place to see what the
suite needs, and nothing validates values.

**Committed JSON config per environment.** Readable and diffable, but invites
someone to add a credential to a tracked file. Non-secret URLs are already
covered by the environment map; secrets stay outside the repo entirely.

**A secret manager (Vault, Doppler, AWS Secrets Manager).** The right answer at
organisational scale and worth naming in an interview, but disproportionate for
two credentials — and GitHub Actions secrets already provide encryption at rest,
masked logs, and access control.

## Consequences

Good: one place to see every input; misconfiguration is loud and early; a public
repository stays safe to publish.

Bad / accepted: contributors must copy `.env.example` before their first run
(documented in the README), and adding a configuration value means editing the
schema as well — a deliberate trade, since the schema _is_ the documentation.
