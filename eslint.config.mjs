// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: 'fastgpt/next-settings',
    settings: {
      next: {
        rootDir: ['projects/app/', 'pro/admin/']
      }
    }
  },
  {
    name: 'fastgpt/rules',
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false
        }
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 3
        }
      ],

      '@next/next/no-html-link-for-pages': 'off',
      'react-hooks/rules-of-hooks': 'off'
    }
  },
  globalIgnores(
    [
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/.next/',
      '**/out/',
      '**/local/',
      '**/coverage/',
      '**/.coverage/',
      '**/.nyc_output/',
      '**/*.log',
      '**/*.min.js',
      '**/*.config.js',
      '**/vitest.config.mts',
      '**/next-env.d.ts',
      '**/bin/',
      '**/scripts/',
      'deploy/',
      'document/',
      'projects/marketplace/',

      'lint-staged.config.mjs'
    ],
    'fastgpt/global-ignores'
  )
]);
