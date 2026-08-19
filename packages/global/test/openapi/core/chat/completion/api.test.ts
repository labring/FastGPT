import {
  ChatTestPropsSchema,
  CompletionsPropsSchema
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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

describe('ChatTestPropsSchema', () => {
  it('rejects legacy workflow input fields', () => {
    const result = ChatTestPropsSchema.safeParse({
      messages: [],
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              selectedTypeIndex: 0
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      appId: '68ad85a7463006c963799a05',
      appName: 'Test app',
      chatId: 'chat-1'
    });

    expect(result.success).toBe(false);
  });
});
