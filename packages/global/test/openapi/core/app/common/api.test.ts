import {
  AppChatConfigInputSchema,
  AppQuestionGuideInputSchema,
  AppTTSConfigInputSchema,
  type CreateAppBodyType,
  CreateAppBodySchema,
  CreateAppRequestBodySchema,
  OpenAPIAppChatConfigSchema,
  OpenAPIAppScheduledTriggerConfigSchema,
  UpdateAppBodySchema
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  type PublishAppBodyType,
  PublishAppBodySchema
} from '@fastgpt/global/openapi/core/app/version/api';
import {
  type StoreNodeItemType,
  NodeToolConfigTypeSchema
} from '@fastgpt/global/core/workflow/type/node';
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

const runtimeNode: StoreNodeItemType = {
  ...currentNode,
  inputs: [],
  flowNodeType: 'toolSet',
  toolConfig: {
    mcpTool: {
      name: 'search',
      description: 'Search',
      url: 'https://mcp.example.com'
    },
    httpTool: {
      name: 'search',
      description: 'Search',
      path: '/search',
      method: 'GET'
    }
  }
};

const runtimeCreateBody: CreateAppBodyType = {
  name: 'runtime app',
  type: 'simple',
  nodes: [runtimeNode],
  edges: []
};
const runtimePublishBody: PublishAppBodyType = {
  nodes: [runtimeNode]
};
void runtimeCreateBody;
void runtimePublishBody;

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
      protocol: 'MCP',
      toolConfig: {
        mcpTool: {
          toolId: 'mcp-app/search',
          headerSecret: { Authorization: { value: 'mcp-tool-secret' } }
        }
      }
    },
    {
      protocol: 'HTTP',
      toolConfig: {
        httpTool: {
          toolId: 'http-app/search',
          headerSecret: { Authorization: { value: 'http-tool-secret' } }
        }
      }
    }
  ])('rejects $protocol secret on a single tool reference', ({ toolConfig }) => {
    const node = {
      ...currentNode,
      toolConfig
    } as StoreNodeItemType;

    expect(parseCreateNode(node)).toBe(false);
  });

  it.each([
    {
      toolSetKey: 'mcpToolSet',
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          headerSecret: { Authorization: { value: 'mcp-set-secret' } },
          toolList: [{ name: 'search', description: 'MCP search' }]
        }
      }
    },
    {
      toolSetKey: 'httpToolSet',
      toolConfig: {
        httpToolSet: {
          baseUrl: 'https://api.example.com',
          headerSecret: { Authorization: { value: 'http-set-secret' } },
          toolList: [{ name: 'search', description: 'HTTP search', path: '/search', method: 'GET' }]
        }
      }
    }
  ])('keeps $toolSetKey secret on a node-local tool set', ({ toolConfig }) => {
    const node = {
      ...currentNode,
      flowNodeType: 'toolSet',
      toolConfig
    } as StoreNodeItemType;

    expect(parseCreateNode(node)).toBe(true);
  });

  it('rejects a tool-set secret when the node uses an external reference', () => {
    const node = {
      ...currentNode,
      flowNodeType: 'toolSet',
      pluginId: 'external-tool-set',
      toolConfig: {
        httpToolSet: {
          baseUrl: 'https://api.example.com',
          headerSecret: { Authorization: { value: 'http-set-secret' } },
          toolList: []
        }
      }
    } as StoreNodeItemType;

    expect(parseCreateNode(node)).toBe(false);
  });

  it('keeps HTTP child tool secret in the shared runtime schema', () => {
    const toolConfig = {
      httpToolSet: {
        baseUrl: 'https://api.example.com',
        toolList: [
          {
            name: 'search',
            description: 'HTTP search',
            path: '/search',
            method: 'GET',
            headerSecret: { Authorization: { value: 'http-child-secret' } }
          }
        ]
      }
    };

    expect(NodeToolConfigTypeSchema.safeParse(toolConfig).success).toBe(true);
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
