// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// 枚举分组规则集中在来源分类模块；业务代码只消费语义化判断。
const groupedChatSourceComparisonsSelector =
  'LogicalExpression' +
  ':matches([left.left.object.name="ChatSourceTypeEnum"], [left.right.object.name="ChatSourceTypeEnum"])' +
  ':matches([right.left.object.name="ChatSourceTypeEnum"], [right.right.object.name="ChatSourceTypeEnum"])';

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
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ],
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
  {
    name: 'fastgpt/chat-source-semantics',
    files: ['packages/**/*.{ts,tsx}', 'projects/**/*.{ts,tsx}', 'pro/**/*.{ts,tsx}'],
    ignores: [
      'packages/global/common/chat/source.ts',
      '**/test/**',
      '**/tests/**',
      '**/*.test.ts',
      '**/*.spec.ts'
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: groupedChatSourceComparisonsSelector,
          message:
            '多个 ChatSourceTypeEnum 的组合判断必须使用 @fastgpt/global/common/chat/source 中的语义化函数。'
        }
      ]
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
