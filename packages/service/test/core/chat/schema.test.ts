import { describe, expect, it } from 'vitest';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

const hasIndex = (
  indexes: ReturnType<typeof MongoChat.schema.indexes>,
  keys: Record<string, 1 | -1>,
  options?: Record<string, unknown>
) =>
  indexes.some(([indexKeys, indexOptions]) => {
    return (
      JSON.stringify(indexKeys) === JSON.stringify(keys) &&
      (!options || Object.entries(options).every(([key, value]) => indexOptions?.[key] === value))
    );
  });

const findIndex = (
  indexes: ReturnType<typeof MongoChat.schema.indexes>,
  keys: Record<string, 1 | -1>
) => indexes.find(([indexKeys]) => JSON.stringify(indexKeys) === JSON.stringify(keys));

describe('chat schema indexes', () => {
  it('requires sourceType for new chat writes without silently defaulting to app', () => {
    for (const schema of [MongoChat.schema, MongoChatItem.schema, MongoChatItemResponse.schema]) {
      const sourceTypePath = schema.path('sourceType');

      expect(sourceTypePath?.options.required).toBe(true);
      expect(sourceTypePath?.options.default).toBeUndefined();
    }
  });

  it('declares source-aware unique chat identity index', () => {
    const indexes = MongoChat.schema.indexes();
    const sourceAwareIndex = findIndex(indexes, { sourceType: 1, appId: 1, chatId: 1 });

    expect(sourceAwareIndex?.[1]?.unique).toBe(true);
  });

  it('keeps legacy chat item read and pagination indexes', () => {
    const indexes = MongoChatItem.schema.indexes();

    expect(hasIndex(indexes, { appId: 1, chatId: 1, dataId: 1 })).toBe(true);
    expect(hasIndex(indexes, { appId: 1, chatId: 1, deleteTime: 1 })).toBe(true);
    expect(hasIndex(indexes, { appId: 1, chatId: 1, _id: -1 })).toBe(true);
    expect(hasIndex(indexes, { appId: 1, chatId: 1, obj: 1, _id: -1 })).toBe(true);
  });

  it('keeps legacy node response lookup index', () => {
    const indexes = MongoChatItemResponse.schema.indexes();

    expect(
      hasIndex(indexes, {
        appId: 1,
        chatId: 1,
        chatItemDataId: 1,
        _id: 1
      })
    ).toBe(true);
  });
});
