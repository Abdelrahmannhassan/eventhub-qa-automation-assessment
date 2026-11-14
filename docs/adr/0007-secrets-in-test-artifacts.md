# ADR 0007 — Secrets leak through test artifacts, not just through code

**Status:** Accepted (Phase 1 hardening)

## Context

ADR 0006 keeps credentials out of git. That is not sufficient. The _outputs_ of
a test run contain secrets too, and on a **public** repository those outputs are
distributed far more widely than the code.

What the artifacts actually contain:

| Artifact               | Can contain                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Playwright **trace**   | Full network log: `Authorization` headers, `Set-Cookie`, session tokens, request/response bodies, and DOM snapshots |
| Playwright **video**   | The browser screen, including values typed into non-password fields (email, phone, name)                            |
| **HTML report**        | Embeds the traces, videos and screenshots above                                                                     |
| `.auth/` storage state | A live session cookie / token                                                                                       |
| CI **logs**            | Anything printed by the suite                                                                                       |

The distribution problem: **GitHub Actions artifacts on a public repository are
downloadable by anyone who can reach the workflow run.** A trace uploaded from a
failed login is therefore a published session token. Playwright has **no
built-in trace redaction** — this cannot be solved by configuration alone.

## Decision

Defence in depth, accepting that artifacts will always contain _something_.

**1. Minimise what is captured.**
`trace`, `video` and `screenshot` stay at **`retain-on-failure` / `only-on-failure`**,
never `on`. Artifacts exist only for runs that actually failed.

**2. Capture nothing from the highest-risk step.**
The `setup` project is where a password is submitted and a token is issued — the
single most secret-dense moment in the run. It therefore runs with
`trace: 'off'` and `video: 'off'`. Auth failures stay diagnosable through the
redacting logger and a failure screenshot, neither of which carries a token.

**3. Bound the exposure window.**
CI uploads use **`retention-days: 7`** rather than the 90-day default. Phase 7.

**4. Make the leaked secret worthless.**
The real mitigation is not technical, it is **credential design**:

- Tests use **dedicated throwaway accounts** created solely for this suite.
- Each account gets a **unique, randomly generated strong password**, used
  nowhere else and shared with no other account.
- Accounts hold **no real personal data** — no real name, no real phone number.
- Credentials live only in `.env` locally and in GitHub Actions **secrets** in
  CI, and can be rotated by changing one secret.

A session token in a 7-day-old trace for a throwaway account that owns nothing
is a near-zero-value leak. The same token for a personal account would be a
serious one.

**5. Never publish the live session.**
`.auth/` is git-ignored and is never uploaded as a CI artifact.

**6. Keep stdout clean.**
`src/core/logger.ts` redacts `pass|token|secret|authorization|cookie|apikey`
before anything reaches the console, because CI logs on a public repository are
world-readable (ADR 0006).

## Alternatives considered

**`trace: 'on'` for maximum debuggability.** Rejected: it would publish a full
network log of every run, successful ones included.

**Post-processing traces to strip secrets.** A trace is a zip of JSONL network
events, so scrubbing is technically possible — but it is custom tooling that
fails silently when a format changes or a new header appears. Rejected as both
fragile and misleadingly reassuring.

**Not uploading artifacts at all.** Safest and worst: a CI failure would then be
undebuggable without local reproduction, which defeats the point of CI.

**Making the repository private.** Not an option — reviewers must read it.

## Consequences

Good: the blast radius of any artifact leak is one disposable account with no
real data; successful runs publish nothing; exposure is time-bounded.

Bad / accepted: auth-step failures are debugged from logs and a screenshot
rather than a trace, and anyone forking this framework for a _real_ product must
re-evaluate this ADR — against a production-adjacent environment the correct
answer may be to stop uploading traces publicly altogether.

**Interview note:** the point worth making out loud is that "we don't commit
secrets" is the easy half. The half people miss is that **traces, videos and CI
artifacts are a distribution channel for secrets**, and on a public repository
they reach a wider audience than the source code does.
