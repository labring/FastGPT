import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';

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
});
