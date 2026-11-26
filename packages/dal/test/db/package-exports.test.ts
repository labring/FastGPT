import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isBlockedPrivateDalRepoImport } from '../../privateBoundary.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

const PUBLIC_DAL_REPO_SPECIFIERS = [
  '@fastgpt/dal/db/repos/registry',
  '@fastgpt/dal/db/repos/appRegistration/repo',
  '@fastgpt/dal/db/repos/appRegistration/repo.type'
] as const;

const PRIVATE_DAL_REPO_SPECIFIERS = [
  '@fastgpt/dal/db/repos/appRegistration/mongo/repo',
  '@fastgpt/dal/db/repos/appRegistration/mongo/repo.ts',
  '@fastgpt/dal/db/repos/appRegistration/mongo/schema',
  '@fastgpt/dal/db/repos/appRegistration/mongo',
  '@fastgpt/dal/db/repos/appRegistration/oceanbase/repo',
  '@fastgpt/dal/db/repos/appRegistration/oceanbase/repo.ts',
  '@fastgpt/dal/db/repos/appRegistration/oceanbase/table',
  '@fastgpt/dal/db/repos/appRegistration/oceanbase'
] as const;

const PRIVATE_PRO_DAL_REPO_SPECIFIERS = [
  '@/dal/db/repos/teamInvoiceTitle/mongo/repo',
  '@/dal/db/repos/teamInvoiceTitle/mongo',
  '@/dal/db/repos/teamInvoiceTitle/oceanbase/table',
  '@/dal/db/repos/wallet/bill/mongo/schema',
  '@/dal/db/repos/wallet/bill/oceanbase/repo.ts'
] as const;

const ALLOWED_PRO_DAL_SPECIFIERS = [
  '@/dal/db/container',
  '@/dal/db/repos/registry',
  '@/dal/db/repos/teamInvoiceTitle/repo',
  '@/dal/db/repos/teamInvoiceTitle/repo.type'
] as const;

const extractLiteralText = (node: ts.Node | undefined): string | undefined => {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
};

const findBlockedPrivateDalImportsInSource = ({
  filePath,
  content
}: {
  filePath: string;
  content: string;
}): string[] => {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    false,
    scriptKind
  );
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = extractLiteralText(node.moduleSpecifier);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const specifier = extractLiteralText(node.moduleReference.expression);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const specifier = extractLiteralText(node.argument.literal);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequireCall) {
        const specifier = extractLiteralText(node.arguments[0]);
        if (specifier !== undefined) {
          specifiers.push(specifier);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return specifiers.filter((specifier) =>
    isBlockedPrivateDalRepoImport({ source: specifier, importer: filePath })
  );
};

const collectTsFiles = (rootDir: string): string[] => {
  const results: string[] = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
};

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

type ResolveGuardPlugin = {
  name?: string;
  enforce?: string;
  config?: () => {
    resolve?: {
      alias?: Array<{ find: RegExp | string; replacement: string }>;
    };
  };
  resolveId?: (source: string, importer?: string) => unknown;
};

describe('@fastgpt/dal repository export & Vitest alias boundary', () => {
  it('enforces package.json exports in Node resolution for both self-references and workspace consumers', () => {
    const dalPkgPath = path.join(REPO_ROOT, 'packages/dal/package.json');
    const servicePkgPath = path.join(REPO_ROOT, 'packages/service/package.json');
    const dalPkg = JSON.parse(fs.readFileSync(dalPkgPath, 'utf8')) as {
      exports: Record<string, string | null>;
    };

    expect(dalPkg.exports['./db/repos/*/repo']).toBeUndefined();
    expect(dalPkg.exports['./db/repos/*/repo.type']).toBeUndefined();
    expect(dalPkg.exports['./db/repos/*/mongo/*']).toBeNull();
    expect(dalPkg.exports['./db/repos/*/oceanbase/*']).toBeNull();

    for (const pkgPath of [dalPkgPath, servicePkgPath]) {
      const nodeRequire = createRequire(pkgPath);

      for (const specifier of PUBLIC_DAL_REPO_SPECIFIERS) {
        const resolved = nodeRequire.resolve(specifier);
        expect(resolved.endsWith('.ts')).toBe(true);
      }

      for (const specifier of PRIVATE_DAL_REPO_SPECIFIERS) {
        let caught: unknown;
        try {
          nodeRequire.resolve(specifier);
        } catch (error) {
          caught = error;
        }
        expect(getErrorCode(caught)).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
      }
    }
  });

  it('allows public DAL repo imports and rejects private mongo/oceanbase imports in Vitest runtime', async () => {
    const repoMod = await import('@fastgpt/dal/db/repos/appRegistration/repo');
    const repoTypeMod = await import('@fastgpt/dal/db/repos/appRegistration/repo.type');
    const registryMod = await import('@fastgpt/dal/db/repos/registry');

    expect(repoMod.AppRegistrationRepoToken).toBeDefined();
    expect(repoTypeMod.AppRegistrationDomainReadSchema).toBeDefined();
    expect(registryMod.coreMongoCollections.length).toBeGreaterThan(0);

    for (const specifier of PRIVATE_DAL_REPO_SPECIFIERS) {
      await expect(import(specifier)).rejects.toThrow(
        new RegExp(
          `Blocked private DAL repository import "${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
        )
      );
    }
  });

  it('wires the private DAL repo guard plugin into every workspace Vitest config using exact repo-root boundaries', async () => {
    const proAdminVitestPath = path.join(REPO_ROOT, 'pro/admin/vitest.config.ts');
    const requirePro = process.env.FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD === '1';
    const configPaths = [
      path.join(REPO_ROOT, 'packages/dal/vitest.config.ts'),
      path.join(REPO_ROOT, 'vitest.config.mts'),
      path.join(REPO_ROOT, 'packages/service/vitest.config.ts'),
      path.join(REPO_ROOT, 'packages/service/vitest.unit.config.ts'),
      path.join(REPO_ROOT, 'packages/service/vitest.integration.config.ts'),
      path.join(REPO_ROOT, 'packages/service/vitest.sandbox.integration.config.ts'),
      path.join(REPO_ROOT, 'projects/app/vitest.config.ts')
    ];

    if (requirePro) {
      expect(
        fs.existsSync(proAdminVitestPath),
        `FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 requires ${proAdminVitestPath}`
      ).toBe(true);
    }
    if (fs.existsSync(proAdminVitestPath)) {
      configPaths.push(proAdminVitestPath);
    }

    for (const configPath of configPaths) {
      const loaded = (await import(configPath)) as {
        default?: { plugins?: ResolveGuardPlugin[] };
      };
      const plugins = loaded.default?.plugins ?? [];
      const guard = plugins.find(
        (plugin) => plugin.name === 'fastgpt-block-private-dal-repo-imports'
      );

      expect(
        guard,
        `Missing DAL guard plugin in ${path.relative(REPO_ROOT, configPath)}`
      ).toBeDefined();
      expect(guard?.enforce).toBe('pre');

      const aliasEntries = guard?.config?.().resolve?.alias ?? [];
      expect(aliasEntries.length).toBeGreaterThan(0);

      for (const specifier of [
        ...PRIVATE_DAL_REPO_SPECIFIERS,
        ...PRIVATE_PRO_DAL_REPO_SPECIFIERS,
        '@fastgpt/dal/db/repos/app/version/mongo/repo',
        '@fastgpt/dal/db/repos/app/version/oceanbase/table'
      ]) {
        const entry = aliasEntries[0];
        expect(entry.find instanceof RegExp && entry.find.test(specifier)).toBe(true);
        const rewritten = specifier.replace(entry.find, entry.replacement);
        expect(() => guard?.resolveId?.(rewritten)).toThrow(
          /Blocked private DAL repository import/
        );
      }

      for (const blockedAliasTraversal of [
        '@/service/../dal/db/repos/teamInvoiceTitle/mongo/repo',
        '@fastgpt/dal/db/../db/repos/appRegistration/oceanbase/table'
      ]) {
        expect(() => guard?.resolveId?.(blockedAliasTraversal)).toThrow(
          /Blocked private DAL repository import/
        );
      }

      for (const allowedSpecifier of [
        ...PUBLIC_DAL_REPO_SPECIFIERS,
        ...ALLOWED_PRO_DAL_SPECIFIERS,
        '@fastgpt/dal/db/mongo/base',
        '@fastgpt/dal/db/oceanbase/base',
        './mongo/repo'
      ]) {
        expect(guard?.resolveId?.(allowedSpecifier)).toBeNull();
      }

      // 1. 外部业务与容器层相对路径越界（含短相对路径）均须阻断
      expect(() =>
        guard?.resolveId?.(
          '../../dal/db/repos/teamInvoiceTitle/mongo/repo',
          path.join(REPO_ROOT, 'pro/admin/src/service/wallet/invoice.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          './repos/teamInvoiceTitle/mongo/schema',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/container.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          './repos/appRegistration/mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/container.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          '../teamInvoiceTitle/mongo/repo',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/other/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);

      // 2. 父子嵌套独立仓储（如 app 与 app/version、wallet 与 wallet/bill）双向互引均须阻断
      expect(() =>
        guard?.resolveId?.(
          '../mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          '../../mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/mongo/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          './version/mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          '../version/mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/mongo/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          '../mongo/schema',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/wallet/bill/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          './bill/mongo/schema',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/wallet/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);

      // 3. 跨作用域 registry 与契约测试越界均须阻断
      expect(() =>
        guard?.resolveId?.(
          '../../../../pro/admin/src/dal/db/repos/teamInvoiceTitle/mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/registry.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          '../../../../../pro/admin/src/dal/db/repos/teamInvoiceTitle/mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/test/db/repos/app/repo.contract.test.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);

      // 4. 合法同域内部（含嵌套子仓储内部、公开 repo.type、本域 registry 与契约测试）放行
      expect(
        guard?.resolveId?.(
          './mongo/repo',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/teamInvoiceTitle/repo.ts')
        )
      ).toBeNull();
      expect(
        guard?.resolveId?.(
          './mongo/repo',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/repo.ts')
        )
      ).toBeNull();
      expect(
        guard?.resolveId?.(
          './schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/mongo/repo.ts')
        )
      ).toBeNull();
      expect(
        guard?.resolveId?.(
          '../repo.type',
          path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/repo.ts')
        )
      ).toBeNull();
      expect(
        guard?.resolveId?.(
          './app/version/mongo/schema',
          path.join(REPO_ROOT, 'packages/dal/db/repos/registry.ts')
        )
      ).toBeNull();
      expect(
        guard?.resolveId?.(
          './teamInvoiceTitle/mongo/schema',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/registry.ts')
        )
      ).toBeNull();
      expect(
        guard?.resolveId?.(
          '../../../../../src/dal/db/repos/teamInvoiceTitle/mongo/schema',
          path.join(REPO_ROOT, 'pro/admin/test/dal/db/repos/teamInvoiceTitle/repo.contract.test.ts')
        )
      ).toBeNull();
    }
  });

  it('verifies Pro DAL skeleton exports and zero AST private DAL imports across DAL, service, app, and Pro', () => {
    const proAdminSrc = path.join(REPO_ROOT, 'pro/admin/src');
    const requirePro = process.env.FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD === '1';

    if (requirePro) {
      expect(
        fs.existsSync(proAdminSrc),
        `FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 requires ${proAdminSrc}`
      ).toBe(true);
    }

    const scanRoots = [
      path.join(REPO_ROOT, 'packages/dal/db'),
      path.join(REPO_ROOT, 'packages/service'),
      path.join(REPO_ROOT, 'projects/app/src')
    ];

    if (fs.existsSync(proAdminSrc)) {
      expect(fs.existsSync(path.join(proAdminSrc, 'dal/db/container.ts'))).toBe(true);
      expect(fs.existsSync(path.join(proAdminSrc, 'dal/db/repos/registry.ts'))).toBe(true);
      scanRoots.push(proAdminSrc);
    }

    const offenders: Array<{ file: string; specifiers: string[] }> = [];
    for (const root of scanRoots) {
      for (const filePath of collectTsFiles(root)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const blocked = findBlockedPrivateDalImportsInSource({ filePath, content });
        if (blocked.length > 0) {
          offenders.push({
            file: path.relative(REPO_ROOT, filePath),
            specifiers: blocked
          });
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps CI AST scanner and ESLint rule aligned on type imports, multiline imports, and nested repo boundaries', async () => {
    const rootRequire = createRequire(path.join(REPO_ROOT, 'package.json'));
    const { ESLint } = rootRequire('eslint') as typeof import('eslint');
    const eslint = new ESLint({ cwd: REPO_ROOT });

    const blockedCases = [
      {
        name: 'short relative import type from container.ts',
        filePath: path.join(REPO_ROOT, 'pro/admin/src/dal/db/container.ts'),
        code: "import type { Foo } from './repos/teamInvoiceTitle/mongo/schema';\nexport type { Foo };\n"
      },
      {
        name: 'multiline named import via alias',
        filePath: path.join(REPO_ROOT, 'pro/admin/src/service/wallet/invoice.ts'),
        code: "import {\n  Foo,\n  Bar\n} from '@/dal/db/repos/teamInvoiceTitle/mongo/repo';\nexport { Foo, Bar };\n"
      },
      {
        name: 'multiline export type re-export via relative path',
        filePath: path.join(REPO_ROOT, 'pro/admin/src/service/wallet/invoice.ts'),
        code: "export type {\n  Foo\n} from '../../dal/db/repos/teamInvoiceTitle/oceanbase/table';\n"
      },
      {
        name: 'inline TypeScript import() type node',
        filePath: path.join(REPO_ROOT, 'pro/admin/src/dal/db/container.ts'),
        code: "export type Schema = import('./repos/teamInvoiceTitle/mongo/schema').Foo;\n"
      },
      {
        name: 'nested child repo importing parent private mongo schema',
        filePath: path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/repo.ts'),
        code: "import { x } from '../mongo/schema';\nexport { x };\n"
      },
      {
        name: 'parent repo importing child private mongo schema',
        filePath: path.join(REPO_ROOT, 'packages/dal/db/repos/app/repo.ts'),
        code: "import { x } from './version/mongo/schema';\nexport { x };\n"
      }
    ];

    for (const testCase of blockedCases) {
      const astViolations = findBlockedPrivateDalImportsInSource({
        filePath: testCase.filePath,
        content: testCase.code
      });
      expect(astViolations.length, `AST missed case: ${testCase.name}`).toBeGreaterThan(0);

      const [lintResult] = await eslint.lintText(testCase.code, { filePath: testCase.filePath });
      const ruleMessages = lintResult.messages.filter(
        (message) => message.ruleId === 'fastgpt/no-private-dal-repo-imports'
      );
      expect(ruleMessages.length, `ESLint missed case: ${testCase.name}`).toBeGreaterThan(0);
    }

    const allowedCases = [
      {
        name: 'nested child repo importing its own mongo repo',
        filePath: path.join(REPO_ROOT, 'packages/dal/db/repos/app/version/repo.ts'),
        code: "import { x } from './mongo/repo';\nexport { x };\n"
      },
      {
        name: 'core registry importing nested child repo schema',
        filePath: path.join(REPO_ROOT, 'packages/dal/db/repos/registry.ts'),
        code: "import { x } from './app/version/mongo/schema';\nexport { x };\n"
      },
      {
        name: 'pro contract test importing pro repo schema',
        filePath: path.join(
          REPO_ROOT,
          'pro/admin/test/dal/db/repos/teamInvoiceTitle/repo.contract.test.ts'
        ),
        code: "import { x } from '../../../../../src/dal/db/repos/teamInvoiceTitle/mongo/schema';\nexport { x };\n"
      }
    ];

    for (const testCase of allowedCases) {
      const astViolations = findBlockedPrivateDalImportsInSource({
        filePath: testCase.filePath,
        content: testCase.code
      });
      expect(astViolations, `AST false positive: ${testCase.name}`).toEqual([]);

      const [lintResult] = await eslint.lintText(testCase.code, { filePath: testCase.filePath });
      const ruleMessages = lintResult.messages.filter(
        (message) => message.ruleId === 'fastgpt/no-private-dal-repo-imports'
      );
      expect(ruleMessages, `ESLint false positive: ${testCase.name}`).toEqual([]);
    }
  });
});
