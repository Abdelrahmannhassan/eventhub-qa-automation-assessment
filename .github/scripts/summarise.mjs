/**
 * Writes a short run summary to the GitHub Actions job summary.
 *
 * Reads the JUnit XML the Playwright `junit` reporter produces, so it reports
 * what actually ran rather than re-deriving anything. Prints to stdout; the
 * workflow appends it to $GITHUB_STEP_SUMMARY.
 */
import fs from 'node:fs';

const JUNIT_PATH = 'test-results/junit.xml';

if (!fs.existsSync(JUNIT_PATH)) {
  console.log('## Test run\n\n:warning: No JUnit results were produced — the suite did not run.');
  process.exit(0);
}

const xml = fs.readFileSync(JUNIT_PATH, 'utf-8');

const attribute = (name) => {
  const match = new RegExp(`<testsuites[^>]*\\b${name}="([^"]*)"`).exec(xml);
  return match ? Number(match[1]) : 0;
};

const total = attribute('tests');
const failures = attribute('failures');
const errors = attribute('errors');
const skipped = attribute('skipped');
const seconds = attribute('time');
const failed = failures + errors;
const passed = total - failed - skipped;

const verdict = failed > 0 ? ':x: **Failed**' : ':white_check_mark: **Passed**';

const lines = [
  '## Test run',
  '',
  verdict,
  '',
  '| | Count |',
  '| --- | --- |',
  `| Passed | ${passed} |`,
  `| Failed | ${failed} |`,
  `| Skipped | ${skipped} |`,
  `| Total | ${total} |`,
  `| Duration | ${seconds.toFixed(1)}s |`,
  '',
];

if (failed > 0) {
  // Name the failing tests so the summary is useful without opening artifacts.
  const failing = [...xml.matchAll(/<testcase\b[^>]*name="([^"]*)"[^>]*>\s*<(failure|error)\b/g)]
    .map((match) => match[1])
    .slice(0, 15);

  if (failing.length > 0) {
    lines.push('### Failing tests', '');
    for (const name of failing) {
      lines.push(`- ${name.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    lines.push('');
  }
}

lines.push(
  'Reports are attached to this run as artifacts (`playwright-report`, ' +
    '`allure-report`, `junit-results`), retained for 7 days.',
);

console.log(lines.join('\n'));
