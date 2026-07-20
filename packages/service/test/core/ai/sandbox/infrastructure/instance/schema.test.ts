import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { getSchemaDeprecatedMongoIndexes } from '@fastgpt/service/common/mongo';

describe('MongoSandboxInstance schema indexes', () => {
  it('declares provider sandbox uniqueness for remote resource records', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const targetIndex = indexes.find(
      ([keys, options]) => keys.provider === 1 && keys.sandboxId === 1 && options?.unique === true
    );

    expect(targetIndex).toBeDefined();
    expect(targetIndex?.[0]).toEqual({ provider: 1, sandboxId: 1 });
  });

  it('does not keep deprecated appId/type sandbox indexes', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const legacyIndex = indexes.find(
      ([keys]) => keys.appId !== undefined || keys.type !== undefined || keys['metadata.skillId']
    );

    expect(legacyIndex).toBeUndefined();
  });

  it('declares replaced sandbox indexes as deprecated on the same Schema', () => {
    const deprecatedIndexes = getSchemaDeprecatedMongoIndexes(MongoSandboxInstance.schema);

    expect(deprecatedIndexes.map((index) => index.indexName)).toEqual([
      'provider_1_appId_1_userId_1_chatId_1',
      'appId_1_chatId_1',
      'metadata.skillId_1',
      'type_1_chatId_1'
    ]);
  });

  it('declares source lookup index for migrated sandbox instances', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const sourceChatIndex = indexes.find(
      ([keys]) => keys.sourceType === 1 && keys.sourceId === 1 && keys.chatId === 1
    );

    expect(sourceChatIndex).toBeDefined();
  });

  it('declares runtime count and inactive scan indexes', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const runningCountIndex = indexes.find(
      ([keys]) =>
        keys.sourceType === 1 &&
        keys.status === 1 &&
        keys.provider === 1 &&
        keys['metadata.archive.state'] === 1
    );
    const inactiveScanIndex = indexes.find(
      ([keys]) =>
        keys.status === 1 && keys.lastActiveAt === 1 && keys['metadata.archive.state'] === 1
    );

    expect(runningCountIndex).toBeDefined();
    expect(inactiveScanIndex).toBeDefined();
  });

  it('declares archive cleanup indexes for archiving and deleting states', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const archivingIndex = indexes.find(
      ([keys]) => keys['metadata.archive.state'] === 1 && keys['metadata.archive.startedAt'] === 1
    );
    const deletingIndex = indexes.find(
      ([keys]) =>
        keys['metadata.archive.state'] === 1 && keys['metadata.archive.deleteStartedAt'] === 1
    );

    expect(archivingIndex).toBeDefined();
    expect(deletingIndex).toBeDefined();
  });

  it('requires sourceType and sourceId for new sandbox instance records', () => {
    expect(MongoSandboxInstance.schema.path('sourceType').isRequired).toBe(true);
    expect(MongoSandboxInstance.schema.path('sourceId').isRequired).toBe(true);
  });
});
