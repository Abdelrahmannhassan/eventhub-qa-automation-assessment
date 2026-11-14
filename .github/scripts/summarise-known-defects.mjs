/**
 * Job summary for the known-defects job.
 *
 * This job's result is intentionally NOT a pass/fail gate. It answers a
 * different question: "did the known defect reproduce on this run?"
 *
 * Because the defect is intermittent, a passing run does NOT mean it is fixed —
 * it means it did not reproduce this time. That distinction is the whole reason
 * these tests are not expressed with `test.fail()`, which would flip an
 * intermittent defect into a flaky test.
 */
import fs from 'node:fs';

const JUNIT_PATH = 'test-results/junit.xml';

/** The defects this job tracks, keyed by a fragment of the test title. */
const DEFECTS = [
  {
    match: 'two simultaneous bookings',
    reference: 'OVERSELL-1 (High)',
    summary: 'POST /bookings oversells under concurrent load',
    detail:
      'Two concurrent bookings for the last seat can both return 201. The lost ' +
      'decrement leaves availableSeats at 0 rather than -1, so the event looks ' +
      'correctly sold out while holding two bookings for one seat. Reproduced ' +
      'independently with plain fetch in 3/6 trials under load. Contradicts the ' +
      'documented "atomically ... decrement available seats".',
    docs: 'docs/api-findings.md §7b',
  },
];

const lines = ['## Known defects', ''];

if (!fs.existsSync(JUNIT_PATH)) {
  lines.push(':warning: No results were produced — the known-defect job did not run its tests.');
  console.log(lines.join('\n'));
  process.exit(0);
}

const xml = fs.readFileSync(JUNIT_PATH, 'utf-8');

const testcases = [
  ...xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/g),
].map((match) => {
  const attrs = match[1] ?? match[3] ?? '';
  const body = match[2] ?? '';
  const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? '';
  const reproduced = /<(failure|error)\b/.test(body);
  return { name, reproduced };
});

lines.push(
  'These tests assert the **correct** behaviour and are deliberately excluded from',
  'the main job, so a known product defect cannot mask a genuine regression.',
  'They are not skipped, weakened or retried — see',
  '[ADR 0010](../blob/main/docs/adr/0010-known-defect-quarantine.md).',
  '',
  '| Defect | Reproduced on this run? | Details |',
  '| --- | --- | --- |',
);

for (const defect of DEFECTS) {
  const owned = testcases.filter((testcase) => testcase.name.includes(defect.match));
  const reproduced = owned.some((testcase) => testcase.reproduced);
  const verdict =
    owned.length === 0
      ? ':grey_question: not run'
      : reproduced
        ? ':red_circle: **yes** — defect still present'
        : ':yellow_circle: not this run (intermittent — **not** evidence of a fix)';

  lines.push(`| **${defect.reference}** — ${defect.summary} | ${verdict} | ${defect.docs} |`);
}

lines.push('', '<details><summary>What each defect means</summary>', '');
for (const defect of DEFECTS) {
  lines.push(`**${defect.reference}** — ${defect.detail}`, '');
}
lines.push('</details>', '');
lines.push(
  '> A green result here is **not** a fix. These defects reproduce intermittently,',
  '> so only a sustained run of green results plus a product change should close one.',
);

console.log(lines.join('\n'));
