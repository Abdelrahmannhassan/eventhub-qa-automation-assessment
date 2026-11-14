import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Lint rules are how our engineering standards survive contact with a growing
 * team. Anything in CLAUDE.md that CAN be enforced mechanically IS enforced
 * here, so review time is spent on design instead of policing basics.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'blob-report/**',
      'allure-results/**',
      'allure-report/**',
      'test-results/**',
      '.auth/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Framework code logs through src/core/logger.ts (which redacts secrets).
      'no-console': 'error',
      // An un-awaited Playwright call is the single most common source of
      // phantom passes in this kind of codebase.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // Hard guardrails against "make it green" shortcuts.
      'playwright/no-skipped-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/expect-expect': 'error',
      'playwright/no-useless-await': 'error',
      'playwright/valid-expect': 'error',
    },
  },

  {
    // Setup projects are framework infrastructure expressed through the test
    // runner, not tests. They legitimately assert nothing: their contract is
    // "produce the session artifact or fail loudly". Every other test file is
    // still held to `expect-expect`.
    files: ['tests/setup/**/*.setup.ts'],
    rules: {
      'playwright/expect-expect': 'off',
    },
  },

  prettier,
);
