import {
  ChatHomeBodySchema,
  ChatCompletionAuthProxySchema,
  ChatTestPropsSchema,
  CompletionsPropsSchema
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { openApiDocumentOptions } from '@fastgpt/global/openapi/generation';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createSchema } from 'zod-openapi';

describe('ChatCompletionAuthProxySchema', () => {
  const tmbId = '68ad85a7463006c963799a05';
  const username = 'user@example.com';

  it.each([undefined, username, '', null, 123])(
    'keeps only tmbId when it is provided, ignoring username: %j',
    (username) => {
      expect(ChatCompletionAuthProxySchema.parse({ tmbId, username })).toEqual({ tmbId });
    }
  );

  it.each([undefined, null])('uses username when tmbId is omitted or null: %j', (tmbId) => {
    expect(ChatCompletionAuthProxySchema.parse({ username: ` ${username} `, tmbId })).toEqual({
      username,
      tmbId: undefined
    });
  });

  it.each([
    {},
    { tmbId: null },
    { username: '' },
    { username: ' ' },
    { username: null },
    { username: 'a'.repeat(129) },
    { username, tmbId: '' },
    { username, tmbId: 'invalid-id' }
  ])('rejects missing identity or invalid selected identity: %j', (value) => {
    expect(ChatCompletionAuthProxySchema.safeParse(value).success).toBe(false);
  });

  it('documents named identity choices with only their supported fields', () => {
    const { schema } = createSchema(CompletionsPropsSchema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    if ('$ref' in schema) throw new Error('Unexpected body schema reference');
    const authProxy = schema.anyOf![0].properties!.authProxy;
    if ('$ref' in authProxy) throw new Error('Unexpected authProxy schema reference');

    expect(authProxy.description).toContain('优先使用 tmbId');
    expect(authProxy.anyOf).toHaveLength(2);
    expect(
      authProxy.anyOf?.map((choice) => ('title' in choice ? choice.title : undefined))
    ).toEqual(['按团队成员 ID', '按用户名']);
    expect(authProxy.anyOf?.[0]).toMatchObject({ required: ['tmbId'] });
    expect(authProxy.anyOf?.[1]).toMatchObject({ required: ['username'] });
    expect(authProxy.anyOf?.[0]).not.toHaveProperty('properties.username');
    expect(authProxy.anyOf?.[1]).not.toHaveProperty('properties.tmbId');
  });
});

describe('CompletionsPropsSchema identity', () => {
  const appId = '68ad85a7463006c963799a05';
  const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user-id' };

  it.each([{}, { appId }, { appId: null, outLinkAuthData: null }])(
    'accepts application identity or an application inferred from request headers: %j',
    (identity) => {
      const result = CompletionsPropsSchema.parse(identity);
      expect(result.appId).toBe(identity.appId ?? undefined);
      expect(result.outLinkAuthData).toBeUndefined();
    }
  );

  it.each([undefined, appId, null, 'invalid-id', 123])(
    'prioritizes valid outLinkAuthData over appId: %j',
    (appId) => {
      const result = CompletionsPropsSchema.parse({ appId, outLinkAuthData });
      expect(result.outLinkAuthData).toEqual(outLinkAuthData);
      expect(result.appId).toBeUndefined();
    }
  );

  it.each([
    { appId: 'invalid-id' },
    { appId, outLinkAuthData: {} },
    { appId, outLinkAuthData: { shareId: 'share-id' } },
    { appId, outLinkAuthData: { outLinkUid: 'outlink-user-id' } },
    { appId, outLinkAuthData: { shareId: '', outLinkUid: 'outlink-user-id' } },
    { appId, outLinkAuthData: JSON.stringify(outLinkAuthData) }
  ])('rejects invalid selected identity without falling back to the application: %j', (input) => {
    expect(CompletionsPropsSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['DevAPI', openAPIDocument],
    ['System OpenAPI', apiDocOpenAPIDocument]
  ] as const)('documents both identity branches in %s for v1 and v2', (_, document) => {
    for (const version of ['v1', 'v2']) {
      const body = document.paths![`/${version}/chat/completions`]!.post!.requestBody!;
      if ('$ref' in body) throw new Error('Unexpected body reference');
      const media = body.content['application/json'];
      const schema = media.schema!;
      if ('$ref' in schema) throw new Error('Unexpected body schema reference');
      expect(schema.anyOf?.map((branch) => branch.title)).toEqual(['应用会话', '外链会话']);
      const [app, outLink] = schema.anyOf!;
      expect(Object.keys(app.properties!)[0]).toBe('appId');
      expect(app.required).not.toContain('appId');
      expect(app.properties).not.toHaveProperty('outLinkAuthData');
      expect(Object.keys(outLink.properties!)[0]).toBe('outLinkAuthData');
      expect(outLink.required).toContain('outLinkAuthData');
      expect(outLink.properties).not.toHaveProperty('appId');
      expect(outLink.properties!.outLinkAuthData).toMatchObject({
        type: 'object',
        required: ['shareId', 'outLinkUid']
      });
      // 应用 ID 可由请求头补足，最小示例不混入其他身份，也不强制要求 body.appId。
      expect(media.example).toEqual({});
      expect(media.examples).toBeUndefined();
      expect(CompletionsPropsSchema.safeParse(media.example).success).toBe(true);
    }
  });
});

describe('CompletionsPropsSchema defaults', () => {
  it.each([undefined, null])('preserves defaults for empty fields: %j', (value) => {
    const result = CompletionsPropsSchema.parse({
      messages: value,
      stream: value,
      variables: value,
      detail: value,
      retainDatasetCite: value,
      showSkillReferences: value,
      responseChatItemId: value
    });
    expect(result).toMatchObject({
      messages: [],
      stream: false,
      variables: {},
      detail: false,
      retainDatasetCite: false,
      showSkillReferences: false
    });
    expect(result.responseChatItemId).toEqual(expect.any(String));
    expectTypeOf(result.stream).toEqualTypeOf<boolean>();
    expectTypeOf(result.variables).toEqualTypeOf<Record<string, any>>();
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
