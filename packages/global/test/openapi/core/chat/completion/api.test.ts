import {
  ChatHomeBodySchema,
  CompletionsPropsSchema
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { describe, expect, it } from 'vitest';

describe('CompletionsPropsSchema chatId', () => {
  it.each([{ input: undefined }, { input: null }, { input: '' }, { input: '   ' }])(
    'generates a chatId for empty input: $input',
    ({ input }) => {
      const result = CompletionsPropsSchema.parse({ chatId: input });

      expect(result.chatId).toHaveLength(24);
    }
  );

  it('preserves an explicit chatId', () => {
    const result = CompletionsPropsSchema.parse({ chatId: 'existing-chat-id' });

    expect(result.chatId).toBe('existing-chat-id');
  });
});

describe('ChatHome OpenAPI contract', () => {
  it('registers the Pro chat home stream route', () => {
    expect(openAPIDocument.paths?.['/proApi/core/chat/chatHome']?.post).toBeDefined();
  });

  it('uses the shared workflow SSE response contract', () => {
    expect(
      openAPIDocument.paths?.['/core/chat/chatTest']?.post?.responses?.[200]?.content?.[
        'text/event-stream'
      ]?.schema
    ).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/core/chat/chatHome']?.post?.responses?.[200]?.content?.[
        'text/event-stream'
      ]?.schema
    ).toBeDefined();
    expect(
      openAPIDocument.paths?.['/v2/chat/completions']?.post?.responses?.[200]?.content?.[
        'text/event-stream'
      ]?.schema
    ).toBeDefined();
  });

  it('accepts the temporary workflow execution payload', () => {
    const result = ChatHomeBodySchema.parse({
      messages: [{ role: 'user', content: 'hello' }],
      responseChatItemId: 'response-id',
      nodes: [],
      edges: [],
      chatConfig: {},
      variables: {},
      appId: '68ad85a7463006c963799a05',
      appName: '主页助手',
      chatId: 'chat-id',
      retainDatasetCite: true,
      showSkillReferences: true
    });

    expect(result).toMatchObject({
      appId: '68ad85a7463006c963799a05',
      retainDatasetCite: true,
      showSkillReferences: true
    });
  });
});
