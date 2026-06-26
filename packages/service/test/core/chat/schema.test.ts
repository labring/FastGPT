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

describe('chat schema indexes', () => {
  it('keeps sourceType optional without silently defaulting new writes to app', () => {
    for (const schema of [MongoChat.schema, MongoChatItem.schema, MongoChatItemResponse.schema]) {
      const sourceTypePath = schema.path('sourceType');

      expect(sourceTypePath?.options.required).toBeUndefined();
      expect(sourceTypePath?.options.default).toBeUndefined();
    }
  });

  it('declares source-aware unique chat identity index while keeping legacy app index', () => {
    const indexes = MongoChat.schema.indexes();

    expect(hasIndex(indexes, { appId: 1, chatId: 1 }, { unique: true })).toBe(true);
    expect(
      hasIndex(
        indexes,
        {
          sourceType: 1,
          appId: 1,
          chatId: 1
        },
        {
          unique: true,
          name: 'sourceType_1_appId_1_chatId_1'
        }
      )
    ).toBe(true);
  });

  it('declares source-aware chat item read and pagination indexes', () => {
    const indexes = MongoChatItem.schema.indexes();

    expect(hasIndex(indexes, { sourceType: 1, appId: 1, chatId: 1, dataId: 1 })).toBe(true);
    expect(hasIndex(indexes, { sourceType: 1, appId: 1, chatId: 1, deleteTime: 1 })).toBe(true);
    expect(hasIndex(indexes, { sourceType: 1, appId: 1, chatId: 1, _id: -1 })).toBe(true);
    expect(hasIndex(indexes, { sourceType: 1, appId: 1, chatId: 1, obj: 1, _id: -1 })).toBe(true);
  });

  it('declares source-aware node response lookup index', () => {
    const indexes = MongoChatItemResponse.schema.indexes();

    expect(
      hasIndex(indexes, {
        sourceType: 1,
        appId: 1,
        chatId: 1,
        chatItemDataId: 1,
        _id: 1
      })
    ).toBe(true);
  });
});
