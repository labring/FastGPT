import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';

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
});
