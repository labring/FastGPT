import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  SQL_FULL_TEXT_ANALYZER_VERSION,
  SQL_FULL_TEXT_MIGRATION_ID
} from '@fastgpt/global/core/dataset/fullText/constants';
import { SystemMigrationCollectionName } from '@fastgpt/global/migration/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { activateSqlFullTextTarget } from '@fastgpt/service/core/dataset/fullText/sql/entity';
import {
  isSqlFullTextTargetReady,
  refreshSqlFullTextTargetReady
} from '@fastgpt/service/core/dataset/fullText/sql/readiness';

const getMetadata = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/common/vectorDB/fullText/controller', () => ({
  getSqlFullTextAdapter: () => ({ getMetadata })
}));
vi.mock('@fastgpt/service/common/vectorDB/fullText/config', () => ({
  getFullTextProvider: () => 'pg'
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => 'pg'
}));

it('requires committed success and the exact target versions, then shares readiness across module instances', async () => {
  const accepted = {
    provider: 'pg',
    targetId: randomUUID(),
    schemaVersion: 1,
    analyzerVersion: SQL_FULL_TEXT_ANALYZER_VERSION
  } as const;
  await activateSqlFullTextTarget(accepted);
  const states = connectionMongo.connection.db!.collection<{
    _id: string;
    status: string;
    result: unknown;
  }>(SystemMigrationCollectionName);
  const stateId = { _id: SQL_FULL_TEXT_MIGRATION_ID };
  await states.insertOne({ ...stateId, status: 'running', result: accepted });
  expect(await refreshSqlFullTextTargetReady()).toBe(false);
  expect(getMetadata).not.toHaveBeenCalled();

  await states.updateOne(stateId, { $set: { status: 'succeeded' } });
  for (const metadata of [
    { ...accepted, targetId: randomUUID() },
    { ...accepted, schemaVersion: 2 },
    { ...accepted, analyzerVersion: 'other' }
  ]) {
    getMetadata.mockResolvedValueOnce(metadata);
    expect(await refreshSqlFullTextTargetReady()).toBe(false);
  }
  getMetadata.mockResolvedValueOnce(accepted);
  const checking = refreshSqlFullTextTargetReady();
  expect(refreshSqlFullTextTargetReady()).toBe(checking);
  expect(await checking).toBe(true);

  getMetadata.mockClear();
  expect(isSqlFullTextTargetReady()).toBe(true);
  vi.resetModules();
  const secondModule = await import('@fastgpt/service/core/dataset/fullText/sql/readiness');
  expect(secondModule.isSqlFullTextTargetReady()).toBe(true);
  expect(getMetadata).not.toHaveBeenCalled();
});
