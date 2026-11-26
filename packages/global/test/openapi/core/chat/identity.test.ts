import { createSchema } from 'zod-openapi';
import { openApiDocumentOptions } from '@fastgpt/global/openapi/generation';
import {
  ChatBatchDeleteBodyRawSchema,
  ChatBatchDeleteBodySchema
} from '@fastgpt/global/openapi/core/chat/history/api';
import { describe, it, expect } from 'vitest';
import { InitChatQuerySchema } from '@fastgpt/global/openapi/core/chat/controler/api';
import { GetHistoriesBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { GetResDataQuerySchema } from '@fastgpt/global/openapi/core/chat/record/api';

const appId = '68ad85a7463006c963799a05';
const tmbId = '68ad85a7463006c963799a06';

describe('shared chat API identity', () => {
  it('uses an object in Body and a JSON string in Query, with the same normalized proxy', () => {
    const authProxy = { tmbId, username: 'ignored' };
    expect(GetHistoriesBodySchema.parse({ appId, authProxy }).authProxy).toEqual({ tmbId });
    expect(
      InitChatQuerySchema.parse({ appId, chatId: 'chat', authProxy: JSON.stringify(authProxy) })
        .authProxy
    ).toEqual({ tmbId });
    expect(
      GetResDataQuerySchema.parse({
        appId,
        chatId: 'chat',
        dataId: 'round',
        authProxy: JSON.stringify({ username: ' member ' })
      }).authProxy
    ).toEqual({ username: 'member' });
  });

  it.each([
    '{',
    'null',
    '[]',
    '{}',
    JSON.stringify({ tmbId: 'invalid', username: 'member' }),
    { tmbId }
  ])('rejects invalid Query proxy without falling back to default: %j', (authProxy) => {
    expect(InitChatQuerySchema.safeParse({ appId, chatId: 'chat', authProxy }).success).toBe(false);
  });

  it('keeps physical deletion outside user identities and omits those fields from its contract', () => {
    expect(
      ChatBatchDeleteBodySchema.parse({
        appId,
        chatIds: ['chat'],
        customUid: 'ignored',
        authProxy: { tmbId }
      })
    ).toEqual({ sourceType: 'app', sourceId: appId, chatIds: ['chat'] });
    const { schema } = createSchema(ChatBatchDeleteBodyRawSchema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    for (const target of schema.anyOf!) {
      expect(target.properties).not.toHaveProperty('customUid');
      expect(target.properties).not.toHaveProperty('authProxy');
      expect(target.anyOf).toBeUndefined();
    }
  });

  it('rejects conflicting identities and unsupported targets before authentication', () => {
    for (const body of [
      { appId, authProxy: JSON.stringify({ tmbId }) },
      { appId, authProxy: { tmbId }, customUid: 'customer' },
      { skillId: appId, authProxy: { tmbId } },
      { outLinkAuthData: { shareId: 'share', outLinkUid: 'user' }, authProxy: { tmbId } }
    ])
      expect(GetHistoriesBodySchema.safeParse(body).success).toBe(false);
  });
});
