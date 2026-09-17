import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  mongoDatasetFind: vi.fn(),
  mongoDatasetFindOne: vi.fn(),
  checkAppResourceReadPermissions: vi.fn(),
  resolveAppResourcesByPermission: vi.fn(),
  getModelHandle: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: mocks.getModelHandle
}));

vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>();
  return {
    ...actual,
    MongoDataset: {
      ...actual.MongoDataset,
      find: mocks.mongoDatasetFind,
      findOne: mocks.mongoDatasetFindOne
    }
  };
});

vi.mock('@fastgpt/service/support/permission/app/resource', () => ({
  checkAppResourceReadPermissions: mocks.checkAppResourceReadPermissions,
  resolveAppResourcesByPermission: mocks.resolveAppResourcesByPermission
}));

import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import {
  assertWorkflowNodeModelResources,
  createWorkflowChildResourceContext,
  loadWorkflowAppResource,
  loadWorkflowDatasetResource,
  loadWorkflowResourceContext,
  prepareWorkflowDebugResourceContext,
  WorkflowResourceError
} from '@fastgpt/service/core/workflow/utils/resource';

const createFindResult = (documents: unknown = []) => ({
  lean: vi.fn().mockResolvedValue(documents)
});

describe('workflow resource context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mongoDatasetFind.mockReturnValue(
      createFindResult([{ _id: 'dataset-1' }, { _id: 'dataset-2' }])
    );
    mocks.mongoDatasetFindOne.mockReturnValue(createFindResult({ _id: 'dataset-2' }));
    mocks.checkAppResourceReadPermissions.mockResolvedValue(undefined);
    mocks.getModelHandle.mockResolvedValue({
      getAllModels: () => [],
      getSystemDefaultModelIds: () => ({})
    });
  });

  it('inherits root cross-team permission when creating a child context', async () => {
    const rootContext = await loadWorkflowResourceContext({
      resources: [{ type: 'dataset', id: 'dataset-1' }],
      teamId: 'root-team',
      isRoot: true
    });

    // 验证入口纯内存初始化，不触发 DB 预查
    expect(mocks.mongoDatasetFind).not.toHaveBeenCalled();
    expect(mocks.mongoDatasetFindOne).not.toHaveBeenCalled();

    const childContext = await runWithContext(
      { mcpClientMemory: {}, resourceContext: rootContext },
      () => createWorkflowChildResourceContext([{ type: 'dataset', id: 'dataset-2' }], 'child-team')
    );

    expect(childContext.isRoot).toBe(true);

    // 运行时真正调用 loadWorkflowDatasetResource 时，才 JIT 查库，且因 isRoot 跳过 teamId 限制
    await runWithContext({ mcpClientMemory: {}, resourceContext: childContext }, () =>
      loadWorkflowDatasetResource({ datasetId: 'dataset-2' })
    );

    expect(mocks.mongoDatasetFindOne).toHaveBeenCalledWith({
      _id: 'dataset-2',
      deleteTime: null
    });
  });

  it('uses the snapshot for static resources and member permissions for dynamic resources', async () => {
    const modelResource = { type: 'model' as const, id: 'model-1' };
    const context = await loadWorkflowResourceContext({ resources: [modelResource] });
    const createNode = (renderType: FlowNodeInputTypeEnum) => ({
      flowNodeType: FlowNodeTypeEnum.chatNode,
      inputs: [
        {
          key: NodeInputKeyEnum.aiModelId,
          value: renderType === FlowNodeInputTypeEnum.reference ? ['source', 'model'] : 'model-1',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [renderType]
        }
      ]
    });

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        assertWorkflowNodeModelResources({
          node: createNode(FlowNodeInputTypeEnum.selectLLMModel),
          params: { [NodeInputKeyEnum.aiModelId]: 'model-1' },
          tmbId: 'tmb-1'
        })
      ).resolves.toBeUndefined();
      await expect(
        assertWorkflowNodeModelResources({
          node: createNode(FlowNodeInputTypeEnum.selectLLMModel),
          params: { [NodeInputKeyEnum.aiModelId]: 'missing-model' },
          tmbId: 'tmb-1'
        })
      ).rejects.toBeInstanceOf(WorkflowResourceError);
      await expect(
        assertWorkflowNodeModelResources({
          node: createNode(FlowNodeInputTypeEnum.reference),
          params: { [NodeInputKeyEnum.aiModelId]: 'model-1' },
          tmbId: 'tmb-1'
        })
      ).resolves.toBeUndefined();
    });

    expect(mocks.checkAppResourceReadPermissions).toHaveBeenCalledOnce();
  });

  it('does not authorize dataset models when no dataset is selected', async () => {
    const node = {
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      inputs: [
        {
          key: NodeInputKeyEnum.datasetSelectList,
          value: [],
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
        },
        {
          key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
          value: true,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        },
        {
          key: NodeInputKeyEnum.datasetSearchExtensionModelId,
          value: 'missing-model',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
        }
      ]
    };

    await expect(
      assertWorkflowNodeModelResources({
        node,
        params: {
          [NodeInputKeyEnum.datasetSelectList]: [],
          [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
          [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'missing-model'
        },
        tmbId: 'tmb-1'
      })
    ).resolves.toBeUndefined();
    expect(mocks.checkAppResourceReadPermissions).not.toHaveBeenCalled();
  });

  it('normalizes legacy model name and legacy keys when preparing debug context', async () => {
    mocks.getModelHandle.mockResolvedValue({
      getAllModels: () => [{ model: 'legacy-llm', modelId: 'resolved-model-id', type: 'llm' }],
      getSystemDefaultModelIds: () => ({})
    });
    mocks.resolveAppResourcesByPermission.mockResolvedValue([
      { type: 'model', id: 'resolved-model-id' }
    ]);
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'legacy-llm',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ]
      } as any
    ];

    const context = await prepareWorkflowDebugResourceContext({
      appId: 'app-debug-1',
      nodes,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(nodes[0].inputs[0].key).toBe(NodeInputKeyEnum.aiModelId);
    expect(nodes[0].inputs[0].value).toBe('resolved-model-id');
    expect(context.resourceMap.has('model:resolved-model-id')).toBe(true);
    expect(mocks.resolveAppResourcesByPermission).toHaveBeenCalledWith({
      appId: 'app-debug-1',
      extracted: [{ type: 'model', id: 'resolved-model-id' }],
      tmbId: 'tmb-1',
      isRoot: false,
      blockOnUnauthorized: true,
      allowRootCrossTeam: false
    });

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, () =>
      assertWorkflowNodeModelResources({
        node: nodes[0],
        params: { [NodeInputKeyEnum.aiModelId]: 'resolved-model-id' },
        tmbId: 'tmb-1'
      })
    );
  });

  it('rejects a declared App resource when the entity is unavailable', async () => {
    const resource = { type: 'tool' as const, id: 'missing-tool' };
    const resourceContext = {
      isRoot: false,
      resourceMap: new Map([['tool:missing-tool', resource]])
    };

    await runWithContext({ mcpClientMemory: {}, resourceContext }, () =>
      expect(
        loadWorkflowAppResource({
          appId: resource.id,
          tmbId: 'tmb-1',
          type: 'tool'
        })
      ).rejects.toBeInstanceOf(WorkflowResourceError)
    );
  });

  describe('prepareWorkflowDebugResourceContext', () => {
    it('extracts resources, loads context, and enforces read permission blocking on unauthorized items', async () => {
      mocks.resolveAppResourcesByPermission.mockResolvedValue([
        { type: 'dataset', id: 'dataset-1' }
      ]);

      const context = await prepareWorkflowDebugResourceContext({
        appId: 'app-debug-1',
        nodes: [
          {
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            nodeId: 'node-ds',
            inputs: [
              {
                key: NodeInputKeyEnum.datasetSelectList,
                value: [{ datasetId: 'dataset-1' }],
                valueType: WorkflowIOValueTypeEnum.datasetSelectList,
                renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
              }
            ]
          } as any
        ],
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: true
      });

      expect(context.isRoot).toBe(true);
      expect(mocks.resolveAppResourcesByPermission).toHaveBeenCalledWith({
        appId: 'app-debug-1',
        extracted: [{ type: 'dataset', id: 'dataset-1' }],
        tmbId: 'tmb-1',
        isRoot: true,
        blockOnUnauthorized: true,
        allowRootCrossTeam: true
      });
    });

    it('propagates permission errors when resolveAppResourcesByPermission throws', async () => {
      mocks.resolveAppResourcesByPermission.mockRejectedValue(new Error('unauthorized resource'));

      await expect(
        prepareWorkflowDebugResourceContext({
          appId: 'app-debug-1',
          nodes: [],
          teamId: 'team-1',
          tmbId: 'tmb-1'
        })
      ).rejects.toThrow('unauthorized resource');
    });
  });
});
