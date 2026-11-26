// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { isBlockedPrivateDalRepoImport } from './packages/dal/privateBoundary.mjs';

const DAL_PRIVATE_BOUNDARY_MESSAGE =
  '禁止越界导入 DAL 仓储私有 mongo/oceanbase 实现，请改用公开的 .../repo 或 .../repo.type。';

/**
 * 复用 `privateBoundary.mjs` 精确校验静态/类型/动态导入与重导出是否越界访问私有 DAL 实现。
 *
 * @type {import('eslint').Rule.RuleModule}
 */
const noPrivateDalRepoImportsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow importing private DAL repository mongo/oceanbase implementations'
    },
    schema: []
  },
  create: (context) => {
    const filename = context.filename;
    /** @param {any} reportNode @param {unknown} specifier */
    const checkSpecifier = (reportNode, specifier) => {
      if (typeof specifier !== 'string') {
        return;
      }
      if (isBlockedPrivateDalRepoImport({ source: specifier, importer: filename })) {
        context.report({
          node: reportNode,
          message: DAL_PRIVATE_BOUNDARY_MESSAGE
        });
      }
    };

    return {
      ImportDeclaration: (node) => checkSpecifier(node.source, node.source?.value),
      ExportNamedDeclaration: (node) => {
        if (node.source !== null && node.source !== undefined) {
          checkSpecifier(node.source, node.source.value);
        }
      },
      ExportAllDeclaration: (node) => checkSpecifier(node.source, node.source?.value),
      ImportExpression: (node) => {
        if (node.source?.type === 'Literal') {
          checkSpecifier(node.source, node.source.value);
        }
      },
      CallExpression: (node) => {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0]?.type === 'Literal'
        ) {
          checkSpecifier(node.arguments[0], node.arguments[0].value);
        }
      },
      /** @param {any} node */
      TSExternalModuleReference: (node) => {
        if (node.expression?.type === 'Literal') {
          checkSpecifier(node.expression, node.expression.value);
        }
      },
      /** @param {any} node */
      TSImportType: (node) => {
        if (node.source?.type === 'Literal') {
          checkSpecifier(node.source, node.source.value);
          return;
        }
        if (node.argument?.type === 'TSLiteralType' && node.argument.literal?.type === 'Literal') {
          checkSpecifier(node.argument.literal, node.argument.literal.value);
        }
      }
    };
  }
};

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
  {
    name: 'fastgpt/dal-private-boundary',
    files: [
      'packages/**/*.{ts,tsx}',
      'projects/**/*.{ts,tsx}',
      'pro/**/*.{ts,tsx}',
      'test/**/*.{ts,tsx}'
    ],
    plugins: {
      fastgpt: {
        rules: {
          'no-private-dal-repo-imports': noPrivateDalRepoImportsRule
        }
      }
    },
    rules: {
      'fastgpt/no-private-dal-repo-imports': 'error'
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
