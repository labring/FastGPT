import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';

describe('MongoSandboxInstance schema indexes', () => {
  it('uses a Mongo-compatible partial index for chat sandbox uniqueness', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const targetIndex = indexes.find(
      ([keys]) => keys.appId === 1 && keys.userId === 1 && keys.chatId === 1
    );

    expect(targetIndex).toBeDefined();
    expect(targetIndex?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: {
        appId: { $exists: true },
        userId: { $exists: true },
        chatId: { $exists: true }
      }
    });
    expect(JSON.stringify(targetIndex?.[1] ?? {})).not.toContain('$ne');
  });

  it('keeps app-chat sandbox uniqueness provider-agnostic', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const targetIndex = indexes.find(
      ([keys, options]) =>
        options?.unique === true && !keys.provider && keys.appId === 1 && keys.chatId === 1
    );

    expect(targetIndex).toBeDefined();
    expect(targetIndex?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: {
        appId: { $exists: true },
        chatId: { $exists: true },
        type: { $exists: true }
      }
    });
  });

  it('declares source-aware lookup index for migrated sandbox instances', () => {
    const indexes = MongoSandboxInstance.schema.indexes();
    const targetIndex = indexes.find(
      ([keys]) => keys.sourceType === 1 && keys.sourceId === 1 && keys.chatId === 1
    );

    expect(targetIndex).toBeDefined();
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
