import { beforeEach, describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { resolveResponseChatItemId } from '@fastgpt/service/core/chat/interactiveResponseDataId';

const base = {
  teamId: '654a4107c32f3bf5f998452f',
  tmbId: '654a4107c32f3bf5f9984530',
  appId: '67e0d5535c02d1d5cdede71f',
  chatId: 'interactive-chat-id'
};

describe('resolveResponseChatItemId', () => {
  beforeEach(async () => {
    await MongoChatItem.deleteMany({ appId: base.appId, chatId: base.chatId });
  });

  it('uses the existing AI dataId for interactive submit responses', async () => {
    await MongoChatItem.create({
      ...base,
      obj: ChatRoleEnum.AI,
      dataId: 'existing-ai-data-id',
      value: []
    });

    await expect(
      resolveResponseChatItemId({
        appId: base.appId,
        chatId: base.chatId,
        responseChatItemId: 'client-response-id',
        interactive: {
          type: 'userSelect',
          params: {
            description: '',
            userSelectOptions: [{ key: 'a', value: 'A' }]
          },
          entryNodeIds: [],
          memoryEdges: [],
          nodeOutputs: []
        },
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [{ text: { content: 'A' } }]
        }
      })
    ).resolves.toBe('existing-ai-data-id');
  });

  it('keeps the client responseChatItemId for interactive query responses', async () => {
    await MongoChatItem.create({
      ...base,
      obj: ChatRoleEnum.AI,
      dataId: 'existing-ai-data-id',
      value: []
    });

    await expect(
      resolveResponseChatItemId({
        appId: base.appId,
        chatId: base.chatId,
        responseChatItemId: 'client-response-id',
        interactive: {
          type: 'agentPlanAskQuery',
          planId: 'plan-id',
          params: {
            query: 'Need more input'
          },
          entryNodeIds: [],
          memoryEdges: [],
          nodeOutputs: []
        },
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [{ text: { content: 'next question' } }]
        }
      })
    ).resolves.toBe('client-response-id');
  });
});
