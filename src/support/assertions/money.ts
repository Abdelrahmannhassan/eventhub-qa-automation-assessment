/**
 * Renders an amount the way the application displays it: a `$` prefix and
 * thousands separators (`$2,500`).
 *
 * The currency symbol is `$` even though the data is clearly Indian — raised as
 * gap G9 in the story review. Tests therefore assert the *number*, and this
 * helper keeps the formatting detail in one place so a currency decision changes
 * one function rather than every UI test.
 */
export function asDisplayedAmount(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}
