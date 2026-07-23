import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  findAppById: vi.fn(),
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: mocks.findAppById
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

import {
  serverGetWorkflowToolRunUserQuery,
  updateWorkflowToolInputByVariables
} from '@fastgpt/service/core/app/tool/workflowTool/utils';
import { validateSystemToolWorkflowAssociation } from '@fastgpt/service/core/app/tool/workflowTool/service';

const createAppQuery = (app: Record<string, unknown> | null) => ({
  lean: vi.fn().mockResolvedValue(app)
});

const createNodes = (renderTypeList: FlowNodeInputTypeEnum[]) => [
  {
    flowNodeType: FlowNodeTypeEnum.pluginInput,
    inputs: [{ key: 'input', renderTypeList }]
  }
];

describe('validateSystemToolWorkflowAssociation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAppById.mockReturnValue(createAppQuery({ _id: 'app-id' }));
    mocks.getAppLatestVersion.mockResolvedValue({
      nodes: createNodes([FlowNodeInputTypeEnum.input])
    });
  });

  it('allows supported inputs and internal variables', async () => {
    mocks.getAppLatestVersion.mockResolvedValueOnce({
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: [
            { key: 'input', renderTypeList: [FlowNodeInputTypeEnum.input] },
            { key: 'internal', renderTypeList: [FlowNodeInputTypeEnum.hidden] }
          ]
        }
      ]
    });

    await expect(validateSystemToolWorkflowAssociation('app-id')).resolves.toBeUndefined();
  });

  it.each([
    FlowNodeInputTypeEnum.fileSelect,
    FlowNodeInputTypeEnum.selectDataset,
    FlowNodeInputTypeEnum.selectDatasetParamsModal,
    FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
    FlowNodeInputTypeEnum.selectLLMModel,
    FlowNodeInputTypeEnum.settingLLMModel,
    FlowNodeInputTypeEnum.customVariable,
    FlowNodeInputTypeEnum.addInputParam
  ])('rejects unsupported input type %s', async (renderType) => {
    mocks.getAppLatestVersion.mockResolvedValueOnce({
      nodes: createNodes([renderType])
    });

    await expect(validateSystemToolWorkflowAssociation('app-id')).rejects.toThrow(
      '系统工具暂不支持关联包含文件、知识库、模型或外部动态输入的工作流'
    );
  });

  it('rejects a missing workflow app', async () => {
    mocks.findAppById.mockReturnValueOnce(createAppQuery(null));

    await expect(validateSystemToolWorkflowAssociation('missing-app')).rejects.toThrow(
      'Workflow app not found'
    );
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });
});

describe('workflow tool internal inputs', () => {
  it('keeps internal defaults and excludes them from external variables and query content', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: [
          {
            key: 'internal',
            defaultValue: 'internal default',
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          },
          {
            key: 'query',
            value: 'old query',
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }
        ]
      }
    ] as any;

    const runtimeNodes = updateWorkflowToolInputByVariables(nodes, {
      internal: 'external value',
      query: 'new query'
    });
    const runtimeInput = runtimeNodes[0].inputs;

    expect(runtimeInput).toEqual([
      expect.objectContaining({ key: 'internal', value: 'internal default' }),
      expect.objectContaining({ key: 'query', value: 'new query' })
    ]);

    const query = serverGetWorkflowToolRunUserQuery({
      pluginInputs: runtimeInput,
      variables: { internal: 'external value', query: 'new query' }
    });
    expect(JSON.stringify(query.value)).not.toContain('internal');
  });
});
