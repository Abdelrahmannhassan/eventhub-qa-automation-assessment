import { expect, test } from '@playwright/test';

import { redact, redactString } from '@core/logger';

/**
 * Regression test for a real leak.
 *
 * During Phase 6a a transient `ECONNRESET` on a cleanup `DELETE` produced a
 * Playwright error whose message embedded the entire HTTP call log — including
 * `Authorization: Bearer eyJhbGci…` — and the full JWT was printed to stdout.
 * Redaction covered object *keys*, so it could not see a token held inside a
 * message string.
 *
 * CI logs on a public repository are world-readable, so this is a security
 * control, not a nicety (ADR 0007). It needs a test because the failure is
 * silent: nothing breaks when redaction stops working.
 */

// A structurally valid but entirely fabricated JWT. Three base64url segments,
// no real signature, no real account.
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiYUBiLmMifQ.c2lnbmF0dXJlLXBsYWNlaG9sZGVy';

/** The shape of the message that actually leaked. */
const LEAKED_CALL_LOG = [
  'apiRequestContext.fetch: socket hang up (ECONNRESET)',
  'Call log:',
  '  - → DELETE https://api.eventhub.rahulshettyacademy.com/api/bookings/63369',
  '    - accept: */*',
  `    - Authorization: Bearer ${FAKE_JWT}`,
].join('\n');

test.describe('logger redaction', { tag: ['@unit', '@security'] }, () => {
  test('a bearer token inside an error message never survives redaction', () => {
    const scrubbed = redactString(LEAKED_CALL_LOG);

    expect(scrubbed, 'no JWT segment may remain').not.toContain('eyJ');
    expect(scrubbed, 'no bearer token may remain').not.toMatch(/Bearer\s+\S{20,}/);
    expect(scrubbed, 'the authorization header must be masked').toContain('[REDACTED]');
    // The surrounding diagnostic context must survive — redaction must not
    // destroy the information that makes a failure debuggable.
    expect(scrubbed).toContain('ECONNRESET');
    expect(scrubbed).toContain('DELETE https://api.eventhub.rahulshettyacademy.com');
  });

  test('tokens are scrubbed wherever they are nested', () => {
    const payloads: Array<[string, unknown]> = [
      ['plain string', FAKE_JWT],
      ['nested object value', { label: 'booking 1', error: LEAKED_CALL_LOG }],
      ['array element', [FAKE_JWT, 'harmless']],
      ['Error instance', new Error(LEAKED_CALL_LOG)],
      ['deeply nested', { a: { b: { c: [{ d: FAKE_JWT }] } } }],
    ];

    for (const [label, payload] of payloads) {
      expect
        .soft(JSON.stringify(redact(payload)), `${label} must not leak a JWT`)
        .not.toContain('eyJ');
    }
  });

  test('sensitive keys are masked and harmless data is left intact', () => {
    const redacted = redact({
      password: 'hunter2',
      token: FAKE_JWT,
      authorization: `Bearer ${FAKE_JWT}`,
      cookie: 'session=abc',
      apiKey: 'sk-12345678',
      // Must survive untouched: redaction that destroys context is useless.
      email: 'qa.customer@example.com',
      bookingRef: 'H-Z91U0V',
      quantity: 3,
      nested: { customerName: 'QA Customer' },
    });

    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('eyJ');
    expect(serialised).not.toContain('session=abc');
    expect(serialised).not.toContain('sk-12345678');

    expect(serialised).toContain('qa.customer@example.com');
    expect(serialised).toContain('H-Z91U0V');
    expect(serialised).toContain('QA Customer');
  });
});
