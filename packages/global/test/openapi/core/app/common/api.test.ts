import {
  AppChatConfigInputSchema,
  AppQuestionGuideInputSchema,
  AppTTSConfigInputSchema,
  CreateAppBodySchema,
  CreateAppRequestBodySchema,
  OpenAPIAppChatConfigSchema,
  OpenAPIAppScheduledTriggerConfigSchema,
  UpdateAppBodySchema
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  PublishAppBodySchema,
  PublishAppRequestBodySchema
} from '@fastgpt/global/openapi/core/app/version/api';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';

const currentNode = {
  nodeId: 'start-1',
  flowNodeType: 'workflowStart',
  name: 'Start',
  inputs: [
    {
      key: 'query',
      label: 'Query',
      renderTypeList: ['input'],
      defaultToAgentGenerated: true
    }
  ],
  outputs: []
};

describe('UpdateAppBodySchema', () => {
  it('rejects workflow fields', () => {
    expect(UpdateAppBodySchema.safeParse({ nodes: [] }).success).toBe(false);
  });
});

describe('CreateAppBodySchema', () => {
  it('accepts canonical workflow payload', () => {
    expect(
      CreateAppBodySchema.safeParse({
        name: 'canonical app',
        type: 'simple',
        nodes: [currentNode],
        edges: [],
        chatConfig: {}
      }).success
    ).toBe(true);
  });

  it('preserves empty scheduled trigger compatibility', () => {
    expect(OpenAPIAppScheduledTriggerConfigSchema.parse({})).toBeUndefined();
  });

  it('normalizes null optional chat config fields', () => {
    const responseConfig = OpenAPIAppChatConfigSchema.parse({
      variables: null,
      questionGuide: null,
      scheduledTriggerConfig: null
    });
    const inputConfig = AppChatConfigInputSchema.parse({
      questionGuide: null,
      ttsConfig: null
    });

    expect(responseConfig.variables).toBeUndefined();
    expect(responseConfig.questionGuide).toBeUndefined();
    expect(responseConfig.scheduledTriggerConfig).toBeUndefined();
    expect(inputConfig.questionGuide).toBeUndefined();
    expect(inputConfig.ttsConfig).toBeUndefined();
  });

  it('preserves legacy chat model references until the post-deploy backfill finishes', () => {
    const result = CreateAppBodySchema.parse({
      name: 'legacy chat config',
      type: 'simple',
      chatConfig: {
        questionGuide: { open: true, model: 'legacy-llm' },
        ttsConfig: { type: 'model', model: 'legacy-tts', voice: 'alloy' }
      }
    });

    expect(result.chatConfig?.questionGuide?.model).toBe('legacy-llm');
    expect(result.chatConfig?.ttsConfig?.model).toBe('legacy-tts');
  });

  it('migrates legacy workflow before validation', () => {
    const result = CreateAppRequestBodySchema.parse({
      name: 'legacy app',
      type: 'simple',
      modules: [
        {
          ...currentNode,
          inputs: [
            {
              ...currentNode.inputs[0],
              llmModelType: 'chat'
            }
          ]
        },
        {
          nodeId: 'legacy-system-config',
          flowNodeType: 'userGuide',
          name: 'Legacy system config',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: { _id: 'legacy-chat-config' }
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes?.[0].inputs[0]).not.toHaveProperty('llmModelType');
    expect(result.chatConfig).not.toHaveProperty('_id');
  });

  it('strips unsupported request fields after migration', () => {
    const result = CreateAppRequestBodySchema.parse({
      name: 'app with extra field',
      type: 'simple',
      modules: [currentNode],
      edges: [],
      chatConfig: {},
      unsupported: true
    });

    expect(result).not.toHaveProperty('unsupported');
    expect(result.nodes).toHaveLength(1);
  });

  it('rejects legacy workflow when migration fails instead of creating an empty app', () => {
    const result = CreateAppRequestBodySchema.safeParse({
      name: 'invalid legacy app',
      type: 'simple',
      modules: [{ flowType: 'legacy', moduleId: 'legacy-module' }],
      edges: []
    });

    expect(result.success).toBe(false);
  });
});

describe('PublishAppBodySchema', () => {
  it('accepts current NodeIO and strips unknown workflow fields', () => {
    expect(
      PublishAppBodySchema.safeParse({ nodes: [currentNode], edges: [], chatConfig: {} }).success
    ).toBe(true);

    const result = PublishAppBodySchema.parse({
      nodes: [
        {
          ...currentNode,
          unsupportedNodeField: true,
          inputs: [{ ...currentNode.inputs[0], unsupportedInputField: true }]
        }
      ],
      edges: [],
      chatConfig: {}
    });

    expect(result).not.toHaveProperty('nodes.0.unsupportedNodeField');
    expect(result).not.toHaveProperty('nodes.0.inputs.0.unsupportedInputField');
  });

  it('documents toolset App runtime roots without weakening normal workflow validation', () => {
    const toolsetNode = {
      ...currentNode,
      flowNodeType: 'toolSet',
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          toolList: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }]
        }
      }
    };

    expect(PublishAppRequestBodySchema.safeParse({ nodes: [toolsetNode] }).success).toBe(true);
    expect(PublishAppBodySchema.safeParse({ nodes: [toolsetNode] }).success).toBe(false);
  });
});

describe('persisted workflow node tool secrets', () => {
  const parseCreateNode = (node: StoreNodeItemType) =>
    CreateAppRequestBodySchema.safeParse({
      name: 'tool secret app',
      type: 'simple',
      nodes: [node],
      edges: []
    }).success;

  it.each([
    {
      nodeType: 'external MCP tool reference',
      flowNodeType: 'tool',
      toolConfig: {
        mcpTool: { toolId: 'mcp-app/search', headerSecret: { Authorization: { value: 'secret' } } }
      },
      pluginId: undefined
    },
    {
      nodeType: 'external HTTP tool set',
      flowNodeType: 'toolSet',
      toolConfig: {
        httpToolSet: {
          toolId: 'http-app',
          headerSecret: { Authorization: { value: 'secret' } },
          toolList: []
        }
      },
      pluginId: 'http-app'
    }
  ])('rejects a secret on $nodeType', ({ flowNodeType, toolConfig, pluginId }) => {
    const node = {
      ...currentNode,
      flowNodeType,
      pluginId,
      toolConfig
    } as StoreNodeItemType;

    expect(parseCreateNode(node)).toBe(false);
  });

  it.each([
    {
      toolSetKey: 'mcpToolSet',
      config: {
        url: 'https://mcp.example.com',
        headerSecret: { Authorization: { value: 'secret' } },
        toolList: [{ name: 'search', description: 'Search' }]
      }
    },
    {
      toolSetKey: 'httpToolSet',
      config: {
        apiSchemaUrl: 'https://api.example.com/openapi.json',
        headerSecret: { Authorization: { value: 'secret' } },
        toolList: [{ name: 'search', description: 'Search' }]
      }
    }
  ] as const)('keeps a secret on a node-local $toolSetKey', ({ toolSetKey, config }) => {
    const toolConfig = {
      [toolSetKey]: config
    };
    const node = {
      ...currentNode,
      flowNodeType: 'toolSet',
      toolConfig
    } as StoreNodeItemType;

    expect(parseCreateNode(node)).toBe(true);
  });

  it.each([
    {
      toolSetKey: 'mcpToolSet',
      config: {
        url: 'https://mcp.example.com',
        toolList: [
          {
            name: 'search',
            description: 'Search',
            inputSchema: { type: 'object' }
          }
        ]
      }
    },
    {
      toolSetKey: 'httpToolSet',
      config: {
        baseUrl: 'https://api.example.com',
        apiSchemaStr: '{"openapi":"3.0.0"}',
        toolList: [
          {
            name: 'search',
            description: 'Search',
            path: '/search',
            method: 'GET',
            inputSchema: { type: 'object' }
          }
        ]
      }
    }
  ] as const)(
    'rejects a full $toolSetKey runtime config on independent workflow nodes',
    ({ toolSetKey, config }) => {
      const node = {
        ...currentNode,
        flowNodeType: 'toolSet',
        toolConfig: { [toolSetKey]: config }
      } as StoreNodeItemType;

      expect(parseCreateNode(node)).toBe(false);
    }
  );

  it.each([
    {
      appType: 'toolSet',
      toolSetKey: 'mcpToolSet',
      config: {
        url: 'https://mcp.example.com',
        headerSecret: { Authorization: { value: 'secret' } },
        toolList: [
          {
            name: 'search',
            description: 'Search',
            inputSchema: { type: 'object' },
            unsupportedToolField: true
          }
        ],
        unsupportedRuntimeField: true
      }
    },
    {
      appType: 'httpToolSet',
      toolSetKey: 'httpToolSet',
      config: {
        baseUrl: 'https://api.example.com',
        apiSchemaStr: '{"openapi":"3.0.0"}',
        headerSecret: { Authorization: { value: 'secret' } },
        toolList: [
          {
            name: 'search',
            description: 'Search',
            path: '/search',
            method: 'GET',
            inputSchema: { type: 'object' }
          }
        ],
        unsupportedRuntimeField: true
      }
    }
  ] as const)(
    'accepts and cleans a full $toolSetKey runtime config on its source App root',
    ({ appType, toolSetKey, config }) => {
      const result = CreateAppRequestBodySchema.safeParse({
        name: 'toolset app',
        type: appType,
        nodes: [
          {
            ...currentNode,
            flowNodeType: 'toolSet',
            toolConfig: { [toolSetKey]: config }
          }
        ],
        edges: []
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const parsedConfig = result.data.nodes?.[0].toolConfig?.[toolSetKey];
      expect(parsedConfig).not.toHaveProperty('unsupportedRuntimeField');
      expect(parsedConfig?.toolList?.[0]).not.toHaveProperty('unsupportedToolField');
    }
  );

  it.each([
    {
      appType: 'httpToolSet',
      toolSetKey: 'mcpToolSet',
      config: {
        url: 'https://mcp.example.com',
        toolList: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }]
      }
    },
    {
      appType: 'toolSet',
      toolSetKey: 'httpToolSet',
      config: {
        toolList: [
          {
            name: 'search',
            description: 'Search',
            path: '/search',
            method: 'GET',
            inputSchema: { type: 'object' }
          }
        ]
      }
    }
  ] as const)(
    'rejects a full $toolSetKey config on a mismatched source App',
    ({ appType, toolSetKey, config }) => {
      expect(
        CreateAppRequestBodySchema.safeParse({
          name: 'mismatched toolset app',
          type: appType,
          nodes: [
            {
              ...currentNode,
              flowNodeType: 'toolSet',
              toolConfig: { [toolSetKey]: config }
            }
          ],
          edges: []
        }).success
      ).toBe(false);
    }
  );

  it('rejects a full MCP runtime config outside the source App root node', () => {
    expect(
      CreateAppRequestBodySchema.safeParse({
        name: 'toolset app',
        type: 'toolSet',
        nodes: [
          currentNode,
          {
            ...currentNode,
            nodeId: 'toolset-2',
            flowNodeType: 'toolSet',
            toolConfig: {
              mcpToolSet: {
                url: 'https://mcp.example.com',
                toolList: [
                  { name: 'search', description: 'Search', inputSchema: { type: 'object' } }
                ]
              }
            }
          }
        ],
        edges: []
      }).success
    ).toBe(false);
  });
});

describe('legacy chat model input schemas', () => {
  it('keeps modelId optional in parsed configuration types', () => {
    // 显式类型赋值让类型检查覆盖字段可省略性，运行时同时验证缺省字段不会被补出。
    const questionGuide: z.infer<typeof AppQuestionGuideInputSchema> = { open: true };
    const ttsConfig: z.infer<typeof AppTTSConfigInputSchema> = { type: 'model' };
    expect(AppQuestionGuideInputSchema.parse(questionGuide)).toStrictEqual(questionGuide);
    expect(AppTTSConfigInputSchema.parse(ttsConfig)).toStrictEqual(ttsConfig);
  });

  it.each([null, undefined])('normalizes empty modelId (%s) to undefined', (modelId) => {
    expect(AppQuestionGuideInputSchema.parse({ open: true, modelId }).modelId).toBeUndefined();
    expect(AppTTSConfigInputSchema.parse({ type: 'model', modelId }).modelId).toBeUndefined();
  });

  it.each([42, false, {}, []])('rejects invalid modelId (%j)', (modelId) => {
    expect(AppQuestionGuideInputSchema.safeParse({ open: true, modelId }).success).toBe(false);
    expect(AppTTSConfigInputSchema.safeParse({ type: 'model', modelId }).success).toBe(false);
  });

  it('preserves deprecated model references for runtime compatibility', () => {
    expect(AppQuestionGuideInputSchema.parse({ open: true, model: 'legacy-llm' })).toMatchObject({
      model: 'legacy-llm'
    });
    expect(
      AppTTSConfigInputSchema.parse({ type: 'model', model: 'legacy-tts', voice: 'alloy' })
    ).toMatchObject({ model: 'legacy-tts' });
  });

  it('keeps canonical modelId references unchanged', () => {
    expect(AppQuestionGuideInputSchema.parse({ open: true, modelId: 'llm-id' })).toMatchObject({
      modelId: 'llm-id'
    });
    expect(
      AppTTSConfigInputSchema.parse({ type: 'model', modelId: 'tts-id', voice: 'alloy' })
    ).toMatchObject({ modelId: 'tts-id' });
  });
});
