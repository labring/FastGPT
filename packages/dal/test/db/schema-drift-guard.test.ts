import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectMongoIndexes, syncMongoCollectionIndexes } from '@fastgpt/dal/db/mongo/indexSync';
import { coreMongoCollections, coreOceanBaseDdls } from '@fastgpt/dal/db/repos/registry';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import { createMongoTestHarness, createOceanBaseTestHarness } from '@fastgpt/dal/db/testing';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

const collectSchemaFiles = (rootDir: string): string[] => {
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
        entry.name === 'test' ||
        entry.name === 'dist' ||
        entry.name === '.git'
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        /(?:schema|Schema)[A-Za-z0-9_]*\.ts$|^ttl\.ts$/.test(entry.name)
      ) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
};

describe('CI schema & index guardrails', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('syncs coreMongoCollections additively with zero missing indexes or drift', async () => {
    const harness = await createMongoTestHarness({ collections: [] });
    try {
      const syncReport = await syncMongoCollectionIndexes({
        client: harness.client,
        collections: coreMongoCollections
      });
      expect(syncReport.errors).toEqual([]);

      const inspect = await inspectMongoIndexes({
        client: harness.client,
        collections: coreMongoCollections
      });
      expect(inspect.missingIndexes).toEqual([]);
      expect(inspect.optionMismatches).toEqual([]);
      expect(inspect.extraManagedIndexes).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('executes coreOceanBaseDdls idempotently against real OceanBase/SeekDB when FASTGPT_TEST_OCEANBASE_URI is provided', async () => {
    const obUri = process.env.FASTGPT_TEST_OCEANBASE_URI?.trim() ?? '';
    const required = process.env.FASTGPT_TEST_REQUIRED_OCEANBASE === '1';

    if (required) {
      expect(
        obUri.length > 0,
        'FASTGPT_TEST_REQUIRED_OCEANBASE=1 requires FASTGPT_TEST_OCEANBASE_URI'
      ).toBe(true);
    }

    if (obUri.length === 0) {
      return;
    }

    const harness = await createOceanBaseTestHarness({
      uri: obUri,
      tables: [],
      ddls: coreOceanBaseDdls
    });
    await harness.close();
  });

  it('enforces zero deprecated: true index tombstones across production Mongo schemas (and Pro when required)', () => {
    const scanRoots = [
      path.join(REPO_ROOT, 'packages/dal/db/repos'),
      path.join(REPO_ROOT, 'packages/service')
    ];

    const proAdminSrc = path.join(REPO_ROOT, 'pro/admin/src');
    const requirePro = process.env.FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD === '1';
    if (requirePro) {
      expect(
        fs.existsSync(proAdminSrc),
        `FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 requires ${proAdminSrc}`
      ).toBe(true);
    }
    if (fs.existsSync(proAdminSrc)) {
      scanRoots.push(proAdminSrc);
    }

    const offenders: string[] = [];
    for (const root of scanRoots) {
      for (const file of collectSchemaFiles(root)) {
        const content = fs.readFileSync(file, 'utf8');
        if (/\bdeprecated\s*:\s*true\b/.test(content)) {
          offenders.push(path.relative(REPO_ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
