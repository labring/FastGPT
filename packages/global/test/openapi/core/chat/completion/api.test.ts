import { ChatAuthProxySchema } from '../../../../../support/permission/chat';
import {
  ChatHomeBodySchema,
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

describe('ChatAuthProxySchema', () => {
  const tmbId = '68ad85a7463006c963799a05';
  const username = 'user@example.com';

  it.each([undefined, username, '', null, 123])(
    'keeps only tmbId when it is provided, ignoring username: %j',
    (username) => {
      expect(ChatAuthProxySchema.parse({ tmbId, username })).toEqual({ tmbId });
    }
  );

  it.each([undefined, null])('uses username when tmbId is omitted or null: %j', (tmbId) => {
    expect(ChatAuthProxySchema.parse({ username: ` ${username} `, tmbId })).toEqual({
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
    expect(ChatAuthProxySchema.safeParse(value).success).toBe(false);
  });

  it('documents named identity choices with only their supported fields', () => {
    const { schema } = createSchema(CompletionsPropsSchema, {
      io: 'input',
      opts: openApiDocumentOptions
    });
    if ('$ref' in schema) throw new Error('Unexpected body schema reference');
    const authProxyWrapper = schema.anyOf![0].anyOf![2].properties!.authProxy;
    if ('$ref' in authProxyWrapper) throw new Error('Unexpected authProxy schema reference');
    const authProxy = authProxyWrapper.allOf![0];

    expect(authProxy.type).toBe('object');
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
      expect(schema.anyOf?.map((branch) => branch.title)).toEqual([
        '应用会话',
        'APP API Key（无需 appId）',
        '外链会话'
      ]);
      const [app, appKey, outLink] = schema.anyOf!;
      for (const branch of [app, appKey]) {
        // 资源说明属于外层；身份分支包含完整字段，动态身份字段排在公共字段前。
        expect(branch.properties).toBeUndefined();
        expect(branch.description).toBeTruthy();
        for (const identity of branch.anyOf!) {
          expect(identity.description).toBeTruthy();
          expect(identity.description).not.toBe(branch.description);
          expect(identity.properties).toHaveProperty('messages');
          expect(identity.properties).toHaveProperty('chatId');
          expect(identity.properties).toHaveProperty('stream');
          expect(identity.properties).not.toHaveProperty('outLinkAuthData');
          expect(identity.not).toBeUndefined();
          if (branch === app) {
            expect(identity.required).toContain('appId');
          } else {
            expect(identity.properties).not.toHaveProperty('appId');
          }
        }
        const [defaultIdentity, customIdentity] = branch.anyOf!;
        expect(defaultIdentity.title).toBe('默认身份');
        expect(defaultIdentity.description).toContain('不传 customUid 和 authProxy');
        expect(Object.keys(defaultIdentity.properties!)[0]).toBe(
          branch === app ? 'appId' : 'chatId'
        );
        expect(defaultIdentity).not.toHaveProperty('properties.customUid');
        expect(defaultIdentity).not.toHaveProperty('properties.authProxy');
        expect(customIdentity).toMatchObject({
          title: '自定义使用者',
          properties: {
            customUid: {
              allOf: [{ type: 'string', maxLength: 1024 }],
              'x-fastgpt-union-parameter': true
            }
          }
        });
        expect(customIdentity.required).toContain('customUid');
        expect(customIdentity.description).toContain('不改变鉴权成员');
        expect(Object.keys(customIdentity.properties!)[0]).toBe('customUid');
        expect(customIdentity).not.toHaveProperty('properties.authProxy');
      }
      expect(app.anyOf?.map((choice) => choice.title)).toEqual([
        '默认身份',
        '自定义使用者',
        '代理团队成员'
      ]);
      expect(app.anyOf![2].required).toContain('authProxy');
      expect(app.anyOf![2].description).toContain('有效 tmbId');
      expect(Object.keys(app.anyOf![2].properties!)[0]).toBe('authProxy');
      expect(app.anyOf![2].properties!.authProxy).toHaveProperty('x-fastgpt-union-parameter', true);
      expect(app.anyOf![2]).not.toHaveProperty('properties.customUid');
      expect(appKey.anyOf?.map((choice) => choice.title)).toEqual(['默认身份', '自定义使用者']);
      expect(appKey.description).toContain('APP API Key');
      expect(Object.keys(outLink.properties!)[0]).toBe('outLinkAuthData');
      expect(outLink.anyOf).toBeUndefined();
      expect(outLink.required).toContain('outLinkAuthData');
      expect(outLink.properties).not.toHaveProperty('appId');
      expect(outLink.properties).not.toHaveProperty('customUid');
      expect(outLink.properties).not.toHaveProperty('authProxy');
      expect(outLink.properties!.outLinkAuthData).toMatchObject({
        type: 'object',
        required: ['shareId', 'outLinkUid']
      });
      // 默认示例为显式应用分支；应用 Key 的省略方式通过独立 union 分支声明。
      expect(media.example).toEqual({ appId });
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

describe('CompletionsPropsSchema customUid', () => {
  const appId = '68ad85a7463006c963799a05';
  it.each([undefined, null, '', '0', ' customer-42 ', 'a'.repeat(1024)])(
    'preserves UID semantics: %j',
    (customUid) => {
      expect(CompletionsPropsSchema.parse({ appId, customUid }).customUid).toBe(
        customUid ?? undefined
      );
    }
  );
  it.each(['customer-42', '', '0'])('rejects customUid=%j together with authProxy', (customUid) => {
    const result = CompletionsPropsSchema.safeParse({
      appId,
      customUid,
      authProxy: { tmbId: appId }
    });
    expect(result.success).toBe(false);
  });
  it.each([undefined, null])('allows proxy with omitted UID %j', (customUid) => {
    expect(
      CompletionsPropsSchema.parse({ appId, customUid, authProxy: { tmbId: appId } }).authProxy
    ).toEqual({ tmbId: appId });
  });
  it.each([123, {}, 'a'.repeat(1025)])('rejects invalid UID %j', (customUid) => {
    expect(CompletionsPropsSchema.safeParse({ appId, customUid }).success).toBe(false);
  });
});
