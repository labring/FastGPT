import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowModelCheckData } from '@fastgpt/global/core/workflow/model/type';
import { describe, it, expect } from 'vitest';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Node } from 'reactflow';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  checkWorkflowNodeIssues,
  checkWorkflowBeforeRunOrPublish,
  checkWorkflowChatConfigModelIssues
} from '@/web/core/workflow/check/check';
import { getWorkflowCheckIssueMessage } from '@/web/core/workflow/check/message';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import commonZh from '@fastgpt/web/i18n/zh-CN/common.json';

const createModelCheckData = (
  models: { modelId: string; model?: string; type: ModelTypeEnum; scope?: string }[]
): WorkflowModelCheckData => ({
  references: models.map((model) => ({
    modelId: model.modelId,
    type: model.type,
    ...(model.scope !== 'team' && model.model ? { legacyModel: model.model } : {})
  })),
  defaultModelIds: Object.fromEntries(
    models.filter((model) => model.scope !== 'team').map((model) => [model.type, model.modelId])
  )
});

describe('workflow model validation', () => {
  it('formats missing models in one translated sentence without node names or a separate model-label key', () => {
    const t = ((key: string, params?: { inputName?: string }) => {
      const text = (commonZh as Record<string, string>)[key.replace('common:', '')] ?? key;
      return text.replace('{{inputName}}', params?.inputName ?? '');
    }) as any;
    expect(
      getWorkflowCheckIssueMessage({
        issueCode: WorkflowCheckIssueCodeEnum.modelRequired,
        t,
        params: {
          nodeName: '知识库搜索',
          inputName: '问题优化'
        }
      })
    ).toBe('未配置[问题优化]模型');
    expect(
      getWorkflowCheckIssueMessage({
        issueCode: WorkflowCheckIssueCodeEnum.modelRequired,
        params: {
          nodeName: '知识库搜索',
          inputName: '问题优化'
        }
      })
    ).toBe('common:core.workflow.check.model_required_short');
  });
  const models = [
    { modelId: 'llm-id', model: 'gpt-4o', type: ModelTypeEnum.llm },
    { modelId: 'rerank-id', model: 'bge-reranker', type: ModelTypeEnum.rerank }
  ];

  it('reports unavailable chat configuration models with a feature-level message', () => {
    const issues = checkWorkflowChatConfigModelIssues({
      chatConfig: {
        questionGuide: { open: true, modelId: 'missing-llm' }
      },
      modelData: createModelCheckData(models),
      t: ((key: string, params?: { inputName?: string; defaultValue?: string }) => {
        if (key === 'common:core.app.Question Guide') return 'Question Guide';
        if (key === 'common:core.workflow.check.model_unavailable_short') {
          return `${params?.inputName} model unavailable`;
        }
        return params?.defaultValue ?? key;
      }) as any
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: WorkflowCheckIssueCodeEnum.modelUnavailable,
      inputKey: 'Question Guide',
      message: 'Question Guide model unavailable'
    });
  });

  it('accepts an empty enabled chat model when a same-type default can be selected', () => {
    expect(
      checkWorkflowChatConfigModelIssues({
        chatConfig: { questionGuide: { open: true } },
        modelData: createModelCheckData(models)
      })
    ).toEqual([]);
  });

  it('reports an enabled chat model as required when no same-type model is available', () => {
    const issues = checkWorkflowChatConfigModelIssues({
      chatConfig: { questionGuide: { open: true } },
      modelData: createModelCheckData([])
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(WorkflowCheckIssueCodeEnum.modelRequired);
  });

  it('does not treat team models as valid default fallback or legacy model matches in workflowCheck', () => {
    const teamModels = [
      { modelId: 'team-llm', model: 'gpt-4o', type: ModelTypeEnum.llm, scope: 'team' }
    ];

    expect(
      checkWorkflowChatConfigModelIssues({
        chatConfig: { questionGuide: { open: true } },
        modelData: createModelCheckData(teamModels)
      })[0]?.code
    ).toBe(WorkflowCheckIssueCodeEnum.modelRequired);
    expect(
      checkWorkflowChatConfigModelIssues({
        chatConfig: { questionGuide: { open: true, model: 'gpt-4o' } },
        modelData: createModelCheckData(teamModels)
      })[0]?.code
    ).toBe(WorkflowCheckIssueCodeEnum.modelUnavailable);
    expect(
      checkWorkflowChatConfigModelIssues({
        chatConfig: { questionGuide: { open: true, modelId: 'team-llm' } },
        modelData: createModelCheckData(teamModels)
      })
    ).toEqual([]);
  });
  const makeModelNode = (
    inputs: FlowNodeItemType['inputs'],
    flowNodeType = FlowNodeTypeEnum.chatNode
  ) =>
    ({
      id: 'model-node',
      type: flowNodeType,
      position: { x: 0, y: 0 },
      data: {
        nodeId: 'model-node',
        flowNodeType,
        name: 'Model node',
        inputs: inputs.map((input) => ({ label: '', ...input })),
        outputs: []
      }
    }) as Node<FlowNodeItemType>;
  const getModelIssueCodes = (node: Node<FlowNodeItemType>) =>
    (
      checkWorkflowNodeIssues({
        nodes: [node],
        edges: [],
        modelData: createModelCheckData(models)
      })['model-node'] ?? []
    ).map((issue) => issue.code);

  it.each([NodeInputKeyEnum.aiModel, NodeInputKeyEnum.aiModelId])(
    'leaves %s expressions for runtime while checking static model IDs',
    (key) => {
      const node = makeModelNode(
        [
          { key, value: '{{selectedModel}}', renderTypeList: [FlowNodeInputTypeEnum.hidden] },
          {
            key: NodeInputKeyEnum.datasetParams,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: {
              datasets: [{ datasetId: 'dataset-id' }],
              usingReRank: true,
              rerankModelId: '{{rerankModelId}}',
              datasetSearchUsingExtensionQuery: true,
              datasetSearchExtensionModelId: '{{extensionModelId}}'
            }
          }
        ],
        FlowNodeTypeEnum.agent
      );
      expect(getModelIssueCodes(node)).not.toContain(WorkflowCheckIssueCodeEnum.modelUnavailable);
      expect(getModelIssueCodes(node)).not.toContain(WorkflowCheckIssueCodeEnum.modelRequired);

      const staticNode = makeModelNode([
        {
          key: NodeInputKeyEnum.aiModelId,
          value: 'missing-model-id',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ]);
      expect(getModelIssueCodes(staticNode)).toContain(WorkflowCheckIssueCodeEnum.modelUnavailable);
    }
  );

  it('does not look up chat model expressions as static references', () => {
    expect(
      checkWorkflowChatConfigModelIssues({
        chatConfig: {
          questionGuide: { open: true, modelId: '{{guideModelId}}' },
          ttsConfig: { type: 'model', modelId: '{{ttsModelId}}' }
        },
        modelData: createModelCheckData([])
      })
    ).toEqual([]);
  });

  it('accepts available canonical and legacy model references', () => {
    const canonicalNode = makeModelNode([
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'llm-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      }
    ]);
    const legacyNode = makeModelNode([
      {
        key: NodeInputKeyEnum.aiModel,
        value: 'gpt-4o',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      }
    ]);

    expect(getModelIssueCodes(canonicalNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
    expect(getModelIssueCodes(legacyNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
  });

  it('reports an unavailable canonical model without repairing it from legacy model', () => {
    const node = makeModelNode([
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'missing-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      },
      {
        key: NodeInputKeyEnum.aiModel,
        value: 'gpt-4o',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      }
    ]);

    const issues = checkWorkflowNodeIssues({
      nodes: [node],
      edges: [],
      modelData: createModelCheckData(models)
    })['model-node'];
    expect(
      issues?.find((issue) => issue.code === WorkflowCheckIssueCodeEnum.modelUnavailable)?.message
    ).toBe('common:core.workflow.check.model_unavailable');
  });

  it('validates all duplicate model inputs on a node in checkWorkflowNodeIssues', () => {
    const duplicateFirstInvalid = makeModelNode([
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'missing-first-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      },
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'llm-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      }
    ]);
    const duplicateSecondInvalid = makeModelNode([
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'llm-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      },
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'missing-second-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      }
    ]);

    expect(getModelIssueCodes(duplicateFirstInvalid)).toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
    expect(getModelIssueCodes(duplicateSecondInvalid)).toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
  });

  it('does not statically validate reference model inputs', () => {
    const referenceNode = makeModelNode([
      {
        key: NodeInputKeyEnum.aiModelId,
        value: ['upstream', 'modelId'],
        renderTypeList: [FlowNodeInputTypeEnum.reference]
      }
    ]);

    expect(getModelIssueCodes(referenceNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
  });

  it.each([undefined, null, '', '   '])(
    'keeps strict model checks for deep search with the exact input label (%s)',
    (value) => {
      const node = makeModelNode(
        [
          {
            key: NodeInputKeyEnum.datasetDeepSearch,
            label: '深度搜索开关',
            value: true,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          },
          {
            key: NodeInputKeyEnum.datasetDeepSearchModelId,
            label: '深度搜索模型',
            value,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        FlowNodeTypeEnum.datasetSearchNode
      );
      node.data.name = '知识库搜索#2';
      const issues = checkWorkflowNodeIssues({
        nodes: [node],
        edges: [],
        modelData: createModelCheckData(models),
        t: ((key: string, params?: { inputName?: string }) =>
          key === 'common:core.workflow.check.model_required_short'
            ? `未配置[${params?.inputName ?? ''}]模型`
            : key) as any
      })['model-node'];
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: WorkflowCheckIssueCodeEnum.modelRequired,
            nodeId: 'model-node',
            inputKey: NodeInputKeyEnum.datasetDeepSearchModelId,
            message: '未配置[深度搜索模型]模型'
          })
        ])
      );
      expect(
        issues?.some((issue) => issue.code === WorkflowCheckIssueCodeEnum.modelUnavailable)
      ).toBe(false);
    }
  );

  it('ignores disabled optional model features and reports a missing canonical model slot', () => {
    const disabledNode = makeModelNode(
      [
        {
          key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
          label: '',
          value: false,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      FlowNodeTypeEnum.datasetSearchNode
    );
    expect(getModelIssueCodes(disabledNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelRequired
    );
    const missingSlot = makeModelNode([]);
    expect(getModelIssueCodes(missingSlot)).toContain(WorkflowCheckIssueCodeEnum.modelRequired);
  });

  it.each([undefined, null, '', '   '])(
    'does not let a legacy model hide an unconfigured dataset search model ID (%s)',
    (value) => {
      const node = makeModelNode(
        [
          {
            key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
            label: '',
            value: true,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModelId,
            label: '问题优化模型',
            value,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModel,
            label: '',
            value: 'gpt-4o',
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        FlowNodeTypeEnum.datasetSearchNode
      );
      const result = checkWorkflowBeforeRunOrPublish({
        nodes: [node],
        edges: [],
        modelData: createModelCheckData(models)
      });
      expect(
        result.issueMap['model-node']?.some(
          (issue) => issue.code === WorkflowCheckIssueCodeEnum.modelRequired
        )
      ).toBe(false);
      expect(
        node.data.inputs.find(
          (input) => input.key === NodeInputKeyEnum.datasetSearchExtensionModelId
        )?.value
      ).toBe(value);
    }
  );

  it.each([undefined, null, false])(
    'does not require a query extension model when its switch is absent or disabled (%s)',
    (value) => {
      const node = makeModelNode(
        [
          {
            key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
            label: '',
            value,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModelId,
            label: '问题优化模型',
            value: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        FlowNodeTypeEnum.datasetSearchNode
      );
      expect(getModelIssueCodes(node)).not.toContain(WorkflowCheckIssueCodeEnum.modelRequired);
    }
  );

  it('does not enable query extension from template defaults when its switch input is missing', () => {
    const node = makeModelNode(
      [
        {
          key: NodeInputKeyEnum.datasetSearchExtensionModelId,
          label: '问题优化模型',
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      FlowNodeTypeEnum.datasetSearchNode
    );
    expect(getModelIssueCodes(node)).not.toContain(WorkflowCheckIssueCodeEnum.modelRequired);
  });

  it('does not treat a hidden defaultValue as an actual query extension model selection', () => {
    const node = makeModelNode(
      [
        {
          key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
          label: '',
          value: true,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        },
        {
          key: NodeInputKeyEnum.datasetSearchExtensionModelId,
          label: '问题优化模型',
          defaultValue: 'llm-id',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      FlowNodeTypeEnum.datasetSearchNode
    );
    expect(getModelIssueCodes(node)).not.toContain(WorkflowCheckIssueCodeEnum.modelRequired);
    expect(
      node.data.inputs.find((input) => input.key === NodeInputKeyEnum.datasetSearchExtensionModelId)
        ?.value
    ).toBeUndefined();
  });

  it('only validates optional dataset models while their feature is enabled', () => {
    const makeRerankNode = (usingReRank: boolean) =>
      makeModelNode(
        [
          {
            key: NodeInputKeyEnum.datasetSearchUsingReRank,
            value: usingReRank,
            renderTypeList: [FlowNodeInputTypeEnum.switch]
          },
          {
            key: NodeInputKeyEnum.datasetSearchRerankModelId,
            value: 'missing-rerank',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        FlowNodeTypeEnum.datasetSearchNode
      );

    expect(getModelIssueCodes(makeRerankNode(false))).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
    expect(getModelIssueCodes(makeRerankNode(true))).toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
  });

  it('validates enabled nested Agent dataset model references', () => {
    const node = makeModelNode(
      [
        {
          key: NodeInputKeyEnum.datasetParams,
          value: {
            datasets: [{ datasetId: 'dataset-1' }],
            [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
            [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'missing-extension-model'
          },
          renderTypeList: [FlowNodeInputTypeEnum.custom]
        }
      ],
      FlowNodeTypeEnum.agent
    );

    expect(getModelIssueCodes(node)).toContain(WorkflowCheckIssueCodeEnum.modelUnavailable);
  });

  it('ignores dataset model parameters when no dataset is selected', () => {
    const searchNode = makeModelNode(
      [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          value: [],
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
        },
        {
          key: NodeInputKeyEnum.datasetSearchUsingReRank,
          value: true,
          renderTypeList: [FlowNodeInputTypeEnum.switch]
        },
        {
          key: NodeInputKeyEnum.datasetSearchRerankModelId,
          value: 'missing-rerank',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
        }
      ],
      FlowNodeTypeEnum.datasetSearchNode
    );
    const agentNode = makeModelNode(
      [
        {
          key: NodeInputKeyEnum.datasetParams,
          value: {
            datasets: [],
            [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
            [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'missing-extension-model'
          },
          renderTypeList: [FlowNodeInputTypeEnum.custom]
        }
      ],
      FlowNodeTypeEnum.agent
    );

    expect(getModelIssueCodes(searchNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
    expect(getModelIssueCodes(agentNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
  });

  it('validates WorkflowTool model selector defaults with arbitrary input keys', () => {
    const availableNode = makeModelNode(
      [
        {
          key: 'selectedModel',
          defaultValue: 'llm-id',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
        }
      ],
      FlowNodeTypeEnum.pluginInput
    );
    const legacyNode = makeModelNode(
      [
        {
          key: 'selectedModel',
          defaultValue: 'gpt-4o',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
        }
      ],
      FlowNodeTypeEnum.pluginInput
    );
    const unavailableNode = makeModelNode(
      [
        {
          key: 'selectedModel',
          defaultValue: 'missing-model-id',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
        }
      ],
      FlowNodeTypeEnum.pluginInput
    );

    expect(getModelIssueCodes(availableNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
    expect(getModelIssueCodes(legacyNode)).not.toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
    expect(getModelIssueCodes(unavailableNode)).toContain(
      WorkflowCheckIssueCodeEnum.modelUnavailable
    );
  });
});
