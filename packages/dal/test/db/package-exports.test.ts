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
  '@fastgpt/dal/db/repos/appRegistration/sql/repo',
  '@fastgpt/dal/db/repos/appRegistration/sql/repo.ts',
  '@fastgpt/dal/db/repos/appRegistration/sql/table',
  '@fastgpt/dal/db/repos/appRegistration/sql'
] as const;

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
  resolveId?: (source: string) => unknown;
};

describe('@fastgpt/dal repository export & Vitest alias boundary', () => {
  it('enforces package.json exports in Node resolution for both self-references and workspace consumers', () => {
    const dalPkgPath = path.join(REPO_ROOT, 'packages/dal/package.json');
    const servicePkgPath = path.join(REPO_ROOT, 'packages/service/package.json');
    const dalPkg = JSON.parse(fs.readFileSync(dalPkgPath, 'utf8')) as {
      exports: Record<string, string | null>;
    };

    // 禁止宽泛跨目录通配符（Node exports 的 `*` 会匹配 `/`），并显式屏蔽 mongo/* 与 sql/*
    expect(dalPkg.exports['./db/repos/*/repo']).toBeUndefined();
    expect(dalPkg.exports['./db/repos/*/repo.type']).toBeUndefined();
    expect(dalPkg.exports['./db/repos/*/mongo/*']).toBeNull();
    expect(dalPkg.exports['./db/repos/*/sql/*']).toBeNull();

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

  it('allows public DAL repo imports and rejects private mongo/sql imports in Vitest runtime', async () => {
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
        '@fastgpt/dal/db/repos/app/version/mongo/repo',
        '@fastgpt/dal/db/repos/app/version/sql/table'
      ]) {
        const entry = aliasEntries[0];
        expect(entry.find instanceof RegExp && entry.find.test(specifier)).toBe(true);
        const rewritten = specifier.replace(entry.find, entry.replacement);
        expect(() => guard?.resolveId?.(rewritten)).toThrow(
          /Blocked private DAL repository import/
        );
        expect(() => guard?.resolveId?.(specifier)).toThrow(
          /Blocked private DAL repository import/
        );
      }

      for (const allowedSpecifier of [
        ...PUBLIC_DAL_REPO_SPECIFIERS,
        '@fastgpt/dal/db/mongo/base',
        '@fastgpt/dal/db/sql/base',
        './mongo/repo'
      ]) {
        expect(guard?.resolveId?.(allowedSpecifier)).toBeNull();
      }
    }
  });
});
