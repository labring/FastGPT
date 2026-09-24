import {
  ChatHomeBodySchema,
  ChatTestPropsSchema,
  CompletionsPropsSchema
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('CompletionsPropsSchema defaults', () => {
  it.each([undefined, null])('preserves defaults for empty fields: %j', (value) => {
    const result = CompletionsPropsSchema.parse({
      messages: value,
      stream: value,
      variables: value,
      detail: value,
      retainDatasetCite: value,
      showSkillReferences: value,
      autoExecute: value,
      responseChatItemId: value
    });
    expect(result).toMatchObject({
      messages: [],
      stream: false,
      variables: {},
      detail: false,
      retainDatasetCite: false,
      showSkillReferences: false,
      autoExecute: false
    });
    expect(result.responseChatItemId).toEqual(expect.any(String));
    expectTypeOf(result.stream).toEqualTypeOf<boolean>();
    expectTypeOf(result.variables).toEqualTypeOf<Record<string, any>>();
    expectTypeOf(result.autoExecute).toEqualTypeOf<boolean>();
  });
});

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

/**
 * `autoExecute` 是固定会话标题特性的开关：前端只在自动执行轮置 true，服务端据此写本地化
 * 固定文案而不是调标题模型。字段缺失时必须默认 false，否则普通对话会被误标成「自动执行」；
 * 同时沿用 `BoolSchema` 的字符串/数字容错，避免客户端序列化差异导致整个特性静默失效。
 */
describe('autoExecute flag', () => {
  const chatTestBase = {
    messages: [],
    nodes: [],
    edges: [],
    chatConfig: {},
    appId: '68ad85a7463006c963799a05',
    appName: 'Test app',
    chatId: 'chat-1'
  };

  it.each([
    { input: undefined, expected: false },
    { input: null, expected: false },
    { input: false, expected: false },
    { input: true, expected: true },
    { input: 'true', expected: true },
    { input: 'false', expected: false },
    { input: 1, expected: true },
    { input: 0, expected: false }
  ])('coerces $input to $expected on both completion schemas', ({ input, expected }) => {
    expect(CompletionsPropsSchema.parse({ autoExecute: input }).autoExecute).toBe(expected);
    expect(ChatTestPropsSchema.parse({ ...chatTestBase, autoExecute: input }).autoExecute).toBe(
      expected
    );
  });

  it('is inherited by the Pro chat home body schema', () => {
    expect(ChatHomeBodySchema.parse({ ...chatTestBase, autoExecute: true }).autoExecute).toBe(true);
    expect(ChatHomeBodySchema.parse({ ...chatTestBase }).autoExecute).toBe(false);
  });
});

describe('ChatTestPropsSchema', () => {
  const invalidSelectedToolInputs = [
    { mode: 'manual' },
    { key: 'query' },
    { key: 'query', mode: 'invalid' },
    { key: 123, mode: 'manual' },
    { key: 'query', mode: 123 }
  ];

  it('accepts extra workflow node and input fields', () => {
    const result = ChatTestPropsSchema.safeParse({
      messages: [],
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          runtimeOnly: true,
          inputs: [
            {
              key: 'query',
              label: 'Query',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              isToolParam: true
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

    expect(result.success).toBe(true);
  });

  it('validates selected tool input configs while accepting extra fields', () => {
    const result = ChatTestPropsSchema.safeParse({
      messages: [],
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [
                {
                  id: 'tool-1',
                  config: {},
                  inputs: [{ key: 'query', mode: 'manual', displayOnly: true }],
                  displayName: 'Search'
                }
              ]
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

    expect(result.success).toBe(true);
  });

  it.each(invalidSelectedToolInputs)('rejects invalid selected tool input config: %o', (inputs) => {
    const result = ChatTestPropsSchema.safeParse({
      messages: [],
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [{ id: 'tool-1', config: {}, inputs }]
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
