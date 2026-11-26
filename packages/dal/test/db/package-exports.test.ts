import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

const STATIC_PRIVATE_DAL_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"`\n]+\s+from\s+)?['"](?:(?:@fastgpt|@)\/dal\/db\/repos\/[^'"]+\/(?:mongo|oceanbase)(?:\/[^'"]*)?|\.\.?\/[^'"]*dal\/db\/repos\/[^'"]+\/(?:mongo|oceanbase)(?:\/[^'"]*)?)['"]/g;

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

  it('wires the private DAL repo guard plugin into every workspace Vitest config using the broad @fastgpt alias', async () => {
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

      for (const allowedSpecifier of [
        ...PUBLIC_DAL_REPO_SPECIFIERS,
        ...ALLOWED_PRO_DAL_SPECIFIERS,
        '@fastgpt/dal/db/mongo/base',
        '@fastgpt/dal/db/oceanbase/base',
        './mongo/repo'
      ]) {
        expect(guard?.resolveId?.(allowedSpecifier)).toBeNull();
      }

      expect(() =>
        guard?.resolveId?.(
          '../../dal/db/repos/teamInvoiceTitle/mongo/repo',
          path.join(REPO_ROOT, 'pro/admin/src/service/wallet/invoice.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(() =>
        guard?.resolveId?.(
          '../teamInvoiceTitle/mongo/repo',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/other/repo.ts')
        )
      ).toThrow(/Blocked private DAL repository import/);
      expect(
        guard?.resolveId?.(
          './mongo/repo',
          path.join(REPO_ROOT, 'pro/admin/src/dal/db/repos/teamInvoiceTitle/repo.ts')
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

  it('verifies Pro DAL skeleton exports and zero static private DAL imports across pro/admin/src', () => {
    const proAdminSrc = path.join(REPO_ROOT, 'pro/admin/src');
    const requirePro = process.env.FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD === '1';

    if (requirePro) {
      expect(
        fs.existsSync(proAdminSrc),
        `FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 requires ${proAdminSrc}`
      ).toBe(true);
    }
    if (!fs.existsSync(proAdminSrc)) {
      return;
    }

    expect(fs.existsSync(path.join(proAdminSrc, 'dal/db/container.ts'))).toBe(true);
    expect(fs.existsSync(path.join(proAdminSrc, 'dal/db/repos/registry.ts'))).toBe(true);

    const proReposPrefix = path.join(proAdminSrc, 'dal/db/repos') + path.sep;
    const offenders: string[] = [];
    for (const filePath of collectTsFiles(proAdminSrc)) {
      if (filePath.startsWith(proReposPrefix)) {
        continue;
      }
      const content = fs.readFileSync(filePath, 'utf8');
      if (STATIC_PRIVATE_DAL_IMPORT_RE.test(content)) {
        offenders.push(path.relative(REPO_ROOT, filePath));
      }
      STATIC_PRIVATE_DAL_IMPORT_RE.lastIndex = 0;
    }

    expect(offenders).toEqual([]);
  });
});
