import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  extractAppResources,
  mergeAppResources,
  nodeHasDynamicInput,
  resolveStoredAppResources,
  splitExtractedAppResources
} from '@fastgpt/service/core/app/resources';

const createInput = (key: string, value: unknown, reference = false) => ({
  key,
  label: key,
  value,
  renderTypeList: reference ? [FlowNodeInputTypeEnum.reference] : [FlowNodeInputTypeEnum.input]
});

const createNode = ({
  flowNodeType = FlowNodeTypeEnum.workflowStart,
  pluginId,
  inputs = []
}: {
  flowNodeType?: FlowNodeTypeEnum;
  pluginId?: string;
  inputs?: ReturnType<typeof createInput>[];
}) =>
  ({
    nodeId: `${flowNodeType}-node`,
    name: 'node',
    flowNodeType,
    pluginId,
    inputs,
    outputs: []
  }) as unknown as StoreNodeItemType;

describe('extractAppResources', () => {
  it('normalizes personal, MCP and HTTP tools into parent resources', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'personal-tool-app'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'mcp-mcp-app/search'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'http-http-app/request'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'systemTool-search'
        })
      ]
    });

    expect(resources).toEqual([
      { type: 'tool', id: 'http-app', data: { toolNames: ['request'] } },
      { type: 'tool', id: 'mcp-app', data: { toolNames: ['search'] } },
      { type: 'tool', id: 'tool-app' }
    ]);
  });

  it('extracts agent, dataset, skill and model resources with stable deduplication', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.appModule,
          pluginId: 'agent-app',
          inputs: [
            createInput(NodeInputKeyEnum.datasetSelectList, [
              { datasetId: 'dataset-1' },
              { datasetId: 'dataset-1' }
            ]),
            createInput(NodeInputKeyEnum.skills, [{ skillId: 'skill-1' }]),
            createInput(NodeInputKeyEnum.aiModel, 'llm-model'),
            createInput(NodeInputKeyEnum.datasetSearchUsingReRank, true),
            createInput(NodeInputKeyEnum.datasetSearchUsingExtensionQuery, true),
            createInput(NodeInputKeyEnum.datasetSearchRerankModel, 'rerank-model'),
            createInput(NodeInputKeyEnum.datasetSearchExtensionModel, 'llm-model')
          ]
        }),
        createNode({
          inputs: [
            createInput(NodeInputKeyEnum.datasetParams, {
              datasets: [{ datasetId: 'dataset-2' }]
            }),
            createInput(NodeInputKeyEnum.skills, [{ skillId: 'skill-1' }]),
            createInput(NodeInputKeyEnum.datasetSearchRerankModel, 'rerank-model'),
            createInput(NodeInputKeyEnum.datasetSearchExtensionModel, 'llm-model')
          ]
        })
      ],
      chatConfig: {
        questionGuide: { open: true, model: 'guide-model' },
        ttsConfig: { type: 'model', model: 'tts-1' }
      } as any
    });

    expect(resources).toEqual([
      { type: 'agent', id: 'agent-app' },
      { type: 'dataset', id: 'dataset-1' },
      { type: 'dataset', id: 'dataset-2' },
      { type: 'model', id: 'guide-model', data: { modelType: 'llm' } },
      { type: 'model', id: 'llm-model', data: { modelType: 'llm' } },
      { type: 'model', id: 'rerank-model', data: { modelType: 'rerank' } },
      { type: 'model', id: 'tts-1', data: { modelType: 'tts' } },
      { type: 'skill', id: 'skill-1' }
    ]);
  });

  it('records selected workflow apps as tool resources', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(NodeInputKeyEnum.selectedTools, [
              {
                id: 'personal-workflow-tool',
                flowNodeType: FlowNodeTypeEnum.appModule
              },
              { id: 'personal-plugin-tool', flowNodeType: FlowNodeTypeEnum.pluginModule }
            ])
          ]
        })
      ]
    });

    expect(resources).toEqual([
      { type: 'tool', id: 'plugin-tool' },
      { type: 'tool', id: 'workflow-tool' }
    ]);
  });
});

describe('nodeHasDynamicInput', () => {
  it('keeps the dynamic source marker separate from the resolved value', () => {
    const node = createNode({
      inputs: [
        createInput(NodeInputKeyEnum.datasetSelectList, [{ datasetId: 'runtime-dataset' }], true)
      ]
    });

    expect(nodeHasDynamicInput(undefined, [NodeInputKeyEnum.datasetSelectList])).toBe(false);
    expect(nodeHasDynamicInput(node, [NodeInputKeyEnum.datasetSelectList])).toBe(true);
    expect(nodeHasDynamicInput(node, [NodeInputKeyEnum.datasetParams])).toBe(false);
  });
});

describe('mergeAppResources', () => {
  it('keeps model types separate and lets a whole toolset override child tools', () => {
    expect(
      mergeAppResources([
        { type: 'model', id: 'same-model', data: { modelType: 'rerank' } },
        { type: 'tool', id: 'toolset', data: { toolNames: ['b'] } },
        { type: 'model', id: 'same-model', data: { modelType: 'llm' } },
        { type: 'tool', id: 'toolset' },
        { type: 'tool', id: 'toolset', data: { toolNames: ['a'] } },
        { type: 'tool', id: 'empty-names', data: { toolNames: [] } }
      ])
    ).toEqual([
      { type: 'model', id: 'same-model', data: { modelType: 'llm' } },
      { type: 'model', id: 'same-model', data: { modelType: 'rerank' } },
      { type: 'tool', id: 'empty-names' },
      { type: 'tool', id: 'toolset' }
    ]);
  });
});

describe('resolveStoredAppResources', () => {
  it('extracts from nodes and merges legacy skill refs when resources is missing', () => {
    expect(
      resolveStoredAppResources({
        nodes: [
          createNode({
            flowNodeType: FlowNodeTypeEnum.appModule,
            pluginId: 'agent-1'
          })
        ],
        resourceRefs: { skillIds: ['legacy-skill'] }
      })
    ).toEqual([
      { type: 'agent', id: 'agent-1' },
      { type: 'skill', id: 'legacy-skill' }
    ]);
  });

  it('keeps an empty array as an empty snapshot', () => {
    expect(
      resolveStoredAppResources({
        resources: [],
        nodes: [
          createNode({
            flowNodeType: FlowNodeTypeEnum.appModule,
            pluginId: 'agent-1'
          })
        ]
      })
    ).toEqual([]);
  });

  it('normalizes legacy child tool ids in a stored snapshot', () => {
    expect(
      resolveStoredAppResources({
        resources: [{ type: 'tool', id: 'mcp-mcp-app/search' }]
      })
    ).toEqual([{ type: 'tool', id: 'mcp-app', data: { toolNames: ['search'] } }]);
  });
});

describe('splitExtractedAppResources', () => {
  it('does not treat toolNames as a permission delta', () => {
    const { kept, added } = splitExtractedAppResources({
      extracted: [{ type: 'tool', id: 'mcp-app', data: { toolNames: ['a', 'b'] } }],
      baseline: [{ type: 'tool', id: 'mcp-app', data: { toolNames: ['a'] } }]
    });
    expect(added).toEqual([]);
    expect(kept).toEqual([{ type: 'tool', id: 'mcp-app', data: { toolNames: ['a', 'b'] } }]);
  });

  it('splits newly added ACL resources from kept baseline resources', () => {
    const { kept, added } = splitExtractedAppResources({
      extracted: [
        { type: 'dataset', id: 'old-dataset' },
        { type: 'skill', id: 'new-skill' },
        { type: 'model', id: 'gpt', data: { modelType: 'llm' } }
      ],
      baseline: [{ type: 'dataset', id: 'old-dataset' }]
    });
    expect(kept).toEqual([
      { type: 'dataset', id: 'old-dataset' },
      { type: 'model', id: 'gpt', data: { modelType: 'llm' } }
    ]);
    expect(added).toEqual([{ type: 'skill', id: 'new-skill' }]);
  });
});
