import { describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import { PgClient } from '@fastgpt/service/common/vectorDB/pg/controller';

vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => 'milvus'
}));

describe('SQL full-text migration provider boundary', () => {
  it('completes all five stages as non-applicable on Milvus without issuing SQL or cleaning Mongo', async () => {
    const query = vi.spyOn(PgClient, 'query');
    const context = {
      migrationId: '20261110_migrate_sql_fulltext',
      runId: 'test',
      signal: new AbortController().signal,
      assertActive: vi.fn(async () => undefined),
      reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
      getCheckpoint: vi.fn(),
      getFailedRecords: vi.fn(),
      reportFailedRecords: vi.fn(),
      saveCheckpoint: vi.fn(),
      fail: vi.fn(async (): Promise<never> => {
        throw new Error('unexpected failure');
      }),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    } satisfies SystemMigrationContext;

    expect(await migrateSqlFullTextMigration(context)).toEqual({
      applicable: false,
      prechecked: 0,
      scanned: 0,
      validated: 0,
      deletedLegacyCount: 0
    });
    expect(
      context.reportProgress.mock.calls
        .map(([value]) => value)
        .filter((value) => value.status === 'succeeded')
    ).toEqual(
      ['prepare', 'preflight', 'scan', 'validation', 'cleanup'].map((key) => ({
        key,
        status: 'succeeded'
      }))
    );
    expect(query).not.toHaveBeenCalled();
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    query.mockRestore();
  });
});
