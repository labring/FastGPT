import { describe, expect, it } from 'vitest';
import { CompletionsPropsSchema } from '../../../../openapi/core/chat/completion/api';
import {
  GetQuoteBodySchema,
  AudioTranscriptionsDataSchema,
  GetChatSpeechBodySchema
} from '../../../../openapi/core/chat/record/api';
import {
  ExportCollectionBodySchema,
  ReadCollectionSourceBodySchema
} from '../../../../openapi/core/dataset/collection/api';
import { GetQuoteDataBodySchema } from '../../../../openapi/core/dataset/data/api';
import {
  MarkChatReadBodySchema,
  GetHistoryStatusBodySchema,
  ChatBatchDeleteBodySchema
} from '../../../../openapi/core/chat/history/api';
import { InitChatQuerySchema } from '../../../../openapi/core/chat/controler/api';
import { PresignChatFilePostUrlSchema } from '../../../../openapi/core/chat/file/api';
import { SandboxCheckExistBodySchema } from '../../../../openapi/core/ai/sandbox/api';
import { apiDocOpenAPIDocument } from '../../../../openapi/provider/systemopenapi';
import { openAPIDocument } from '../../../../openapi/provider/devapi';

const id = '68ad85a7463006c963799a05';
const context = { appId: id, chatItemDataId: 'round' };

describe('chat ID boundaries', () => {
  it.each([
    {
      name: 'completion',
      schema: CompletionsPropsSchema,
      input: { appId: id, messages: [{ role: 'user', content: 'hello' }] }
    },
    {
      name: 'quote',
      schema: GetQuoteBodySchema,
      input: { ...context, datasetDataIdList: [], collectionIdList: [] }
    },
    {
      name: 'source',
      schema: ReadCollectionSourceBodySchema,
      input: { ...context, collectionId: id, customUid: 'customer' }
    },
    {
      name: 'quote data',
      schema: GetQuoteDataBodySchema,
      input: { ...context, id, customUid: 'customer' }
    },
    {
      name: 'export',
      schema: ExportCollectionBodySchema,
      input: { ...context, collectionId: id, customUid: 'customer' }
    },
    {
      name: 'transcriptions',
      schema: AudioTranscriptionsDataSchema,
      input: { appId: id, duration: 1 }
    },
    {
      name: 'speech',
      schema: GetChatSpeechBodySchema,
      input: {
        appId: id,
        input: 'hello',
        ttsConfig: { type: 'model', modelId: id, voice: 'voice' }
      }
    },
    { name: 'history update', schema: MarkChatReadBodySchema, input: { appId: id } },
    { name: 'initialization', schema: InitChatQuerySchema, input: { appId: id } },
    {
      name: 'upload',
      schema: PresignChatFilePostUrlSchema,
      input: { appId: id, filename: 'test.txt' }
    },
    { name: 'sandbox', schema: SandboxCheckExistBodySchema, input: { appId: id } }
  ])('$name accepts 1024 characters and rejects 1025', ({ schema, input }) => {
    expect(schema.safeParse({ ...input, chatId: 'c'.repeat(1024) }).success).toBe(true);
    expect(schema.safeParse({ ...input, chatId: 'c'.repeat(1025) }).success).toBe(false);
  });

  it.each([GetHistoryStatusBodySchema, ChatBatchDeleteBodySchema])(
    'limits every ID in batch requests',
    (schema) => {
      expect(schema.safeParse({ appId: id, chatIds: ['c'.repeat(1024)] }).success).toBe(true);
      expect(schema.safeParse({ appId: id, chatIds: ['short', 'c'.repeat(1025)] }).success).toBe(
        false
      );
    }
  );

  it('publishes the same maximum in both API documents', () => {
    for (const document of [apiDocOpenAPIDocument, openAPIDocument]) {
      let checked = 0;
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        const object = value as Record<string, any>;
        if (object.properties?.chatId) {
          expect(object.properties.chatId.maxLength).toBe(1024);
          checked++;
        }
        Object.values(object).forEach(visit);
      };
      visit(document);
      expect(checked).toBeGreaterThan(20);
    }
    expect(apiDocOpenAPIDocument.components?.securitySchemes?.ApiKeyAuth).toMatchObject({
      description: expect.stringContaining('无需传 appId')
    });
  });
});
