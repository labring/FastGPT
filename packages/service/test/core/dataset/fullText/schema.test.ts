import { describe, expect, it } from 'vitest';
import {
  MongoFullTextMigrationLog,
  MongoFullTextMigrationFailed,
  FullTextMigrationLogCollectionName,
  FullTextMigrationFailedCollectionName
} from '@fastgpt/service/core/dataset/fullText/schema';

describe('migration schemas', () => {
  it('TC-14.1 logs collection exposes unique migrationId model', () => {
    expect(FullTextMigrationLogCollectionName).toBe('full_text_migration_logs');
    expect(MongoFullTextMigrationLog).toBeDefined();

    const indexes = MongoFullTextMigrationLog.schema.indexes();
    const migrationIdIndex = indexes.find(([key]) => 'migrationId' in key);
    expect(migrationIdIndex).toBeDefined();
    // @ts-expect-error tuple typed as [IndexDefinition, IndexOptions] — check unique flag
    expect(migrationIdIndex[1].unique).toBe(true);
  });

  it('TC-14.2 failed collection exposes unique (migrationId,dataId) model', () => {
    expect(FullTextMigrationFailedCollectionName).toBe('full_text_migration_failed');
    expect(MongoFullTextMigrationFailed).toBeDefined();

    const indexes = MongoFullTextMigrationFailed.schema.indexes();
    const migrationIdDataIdIndex = indexes.find(([key]) => 'migrationId' in key && 'dataId' in key);
    expect(migrationIdDataIdIndex).toBeDefined();
    // @ts-expect-error tuple typed as [IndexDefinition, IndexOptions] — check unique flag
    expect(migrationIdDataIdIndex[1].unique).toBe(true);
  });
});
