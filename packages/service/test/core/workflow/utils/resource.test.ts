import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  mongoDatasetFind: vi.fn(),
  checkAppResourceReadPermissions: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>();
  return {
    ...actual,
    MongoDataset: {
      ...actual.MongoDataset,
      find: mocks.mongoDatasetFind
    }
  };
});

vi.mock('@fastgpt/service/support/permission/app/resource', () => ({
  checkAppResourceReadPermissions: mocks.checkAppResourceReadPermissions
}));

import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import {
  assertWorkflowNodeModelResources,
  createWorkflowChildResourceContext,
  loadWorkflowAppResource,
  loadWorkflowResourceContext,
  WorkflowResourceError
} from '@fastgpt/service/core/workflow/utils/resource';

const createFindResult = (documents: unknown[] = []) => ({
  lean: vi.fn().mockResolvedValue(documents)
});

describe('workflow resource context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mongoDatasetFind.mockReturnValue(
      createFindResult([{ _id: 'dataset-1' }, { _id: 'dataset-2' }])
    );
    mocks.checkAppResourceReadPermissions.mockResolvedValue(undefined);
  });

  it('inherits root cross-team permission when creating a child context', async () => {
    const rootContext = await loadWorkflowResourceContext({
      resources: [{ type: 'dataset', id: 'dataset-1' }],
      teamId: 'root-team',
      isRoot: true
    });

    const childContext = await runWithContext(
      { mcpClientMemory: {}, resourceContext: rootContext },
      () => createWorkflowChildResourceContext([{ type: 'dataset', id: 'dataset-2' }], 'child-team')
    );

    expect(childContext.isRoot).toBe(true);
    expect(mocks.mongoDatasetFind).toHaveBeenNthCalledWith(2, {
      _id: { $in: ['dataset-2'] },
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

  it('rejects a declared App resource when the entity is unavailable', async () => {
    const resource = { type: 'tool' as const, id: 'missing-tool' };
    const resourceContext = {
      isRoot: false,
      resources: [resource],
      resourceMap: new Map([['tool:missing-tool', resource]]),
      appMap: new Map(),
      workflowMap: new Map(),
      datasetMap: new Map(),
      skillMap: new Map()
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
});
