import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import {
  loadWorkflowSkillResources,
  loadWorkflowAppResource,
  loadWorkflowDatasetResource,
  loadWorkflowModelResource,
  WorkflowResourceError
} from '@fastgpt/service/core/workflow/resource/service';
import { getUser } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mongoDatasetFind: vi.fn(),
  mongoDatasetFindOne: vi.fn(),
  authDatasetByTmbId: vi.fn(),
  assertAuthModels: vi.fn(),
  resolveAppResourcesByPermission: vi.fn(),
  getSystemModelHandle: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: mocks.getSystemModelHandle,
  getTeamModelHandle: mocks.getSystemModelHandle
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

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mocks.authDatasetByTmbId
}));

vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: mocks.assertAuthModels
}));

import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import {
  createSystemToolResourceContext,
  filterWorkflowToolList,
  hasWorkflowResource,
  createWorkflowResourceContext
} from '@fastgpt/service/core/workflow/resource/context';

const createFindResult = (documents: unknown = []) => ({
  lean: vi.fn().mockResolvedValue(documents)
});

describe('workflow resource context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authDatasetByTmbId.mockImplementation(async ({ datasetId }) => ({
      dataset: { _id: datasetId }
    }));
    mocks.mongoDatasetFind.mockReturnValue(
      createFindResult([{ _id: 'dataset-1' }, { _id: 'dataset-2' }])
    );
    mocks.mongoDatasetFindOne.mockReturnValue(createFindResult({ _id: 'dataset-2' }));
    mocks.assertAuthModels.mockResolvedValue({ handle: {}, models: [] });
    mocks.getSystemModelHandle.mockResolvedValue({
      getActiveModels: () => [],
      getSystemDefaultModelIds: () => ({}),
      getLLMModelData: vi.fn(({ modelId, model }: { modelId?: string; model?: string }) => ({
        modelId: modelId ?? 'model-1',
        model: model ?? modelId ?? 'model-1',
        name: model ?? modelId ?? 'model-1',
        type: 'llm',
        config: {}
      })),
      getRerankModelData: vi.fn(({ modelId, model }: { modelId?: string; model?: string }) => ({
        modelId: modelId ?? 'rerank-1',
        model: model ?? modelId ?? 'rerank-1',
        name: model ?? modelId ?? 'rerank-1',
        type: 'rerank',
        config: {}
      })),
      getDefaultModelData: vi.fn((slot: string) => ({
        modelId: `default-${slot}`,
        model: `default-${slot}`,
        name: `default-${slot}`,
        type: slot,
        config: {}
      }))
    });
  });

  it('inherits root cross-team permission when creating a child context', async () => {
    const rootContext = createWorkflowResourceContext({
      resources: [{ type: 'dataset', id: 'dataset-1' }],
      teamId: 'root-team',
      isRoot: true
    });

    // 验证入口纯内存初始化，不触发 DB 预查
    expect(mocks.mongoDatasetFind).not.toHaveBeenCalled();
    expect(mocks.mongoDatasetFindOne).not.toHaveBeenCalled();

    const childContext = await runWithContext(
      { mcpClientMemory: {}, resourceContext: rootContext },
      () =>
        createWorkflowResourceContext({
          resources: [{ type: 'dataset', id: 'dataset-2' }],
          teamId: 'child-team'
        })
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

  it('uses the snapshot when a model hits and falls back to member permissions when it misses', async () => {
    const modelResource = { type: 'model' as const, id: 'model-1' };
    const context = createWorkflowResourceContext({ resources: [modelResource] });

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowModelResource({
          modelId: 'model-1',
          teamId: 'team-1',
          tmbId: 'tmb-1'
        })
      ).resolves.toMatchObject({ modelId: 'model-1' });
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();

      await expect(
        loadWorkflowModelResource({
          modelId: 'missing-model',
          teamId: 'team-1',
          tmbId: 'tmb-1'
        })
      ).resolves.toMatchObject({ modelId: 'missing-model' });
    });

    expect(mocks.assertAuthModels).toHaveBeenCalledExactlyOnceWith({
      actor: { teamId: 'team-1', tmbId: 'tmb-1', isRoot: false },
      modelIds: ['missing-model'],
      action: 'use',
      handle: expect.anything()
    });
  });

  it('falls back to default model on ModelConfigError when fallbackToDefault is true, but rethrows permission errors', async () => {
    const context = createWorkflowResourceContext({
      resources: [{ type: 'model', id: 'deleted-static-model' }]
    });
    const handle = await mocks.getSystemModelHandle();

    handle.getRerankModelData.mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unExist);
    });
    mocks.assertAuthModels.mockRejectedValueOnce(new UserError(ModelErrEnum.unAuthModel));

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowModelResource({
          modelId: 'deleted-static-model',
          type: 'rerank',
          fallbackToDefault: true,
          teamId: 'team-1',
          tmbId: 'tmb-1'
        })
      ).resolves.toMatchObject({ modelId: 'default-rerank' });

      await expect(
        loadWorkflowModelResource({
          modelId: 'unauthorized-runtime-model',
          type: 'rerank',
          fallbackToDefault: true,
          teamId: 'team-1',
          tmbId: 'tmb-1'
        })
      ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
    });
  });

  it('system tool context extracts static resources into snapshot and authorizes undeclared resources by member', async () => {
    const rootContext = createWorkflowResourceContext({ resources: [], isRoot: true });
    const systemNodes = [
      {
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'static-model-1',
            label: '',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ]
      },
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            value: [{ datasetId: 'dataset-2' }],
            label: '',
            valueType: WorkflowIOValueTypeEnum.selectDataset,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
          }
        ]
      }
    ] as any;
    const context = await runWithContext(
      { mcpClientMemory: {}, resourceContext: rootContext },
      () => createSystemToolResourceContext({ nodes: systemNodes })
    );
    expect(context).toMatchObject({ isRoot: true });
    expect(context.teamId).toBeUndefined();
    expect(hasWorkflowResource({ context, type: 'model', id: 'static-model-1' })).toBe(true);
    expect(hasWorkflowResource({ context, type: 'dataset', id: 'dataset-2' })).toBe(true);
    expect(hasWorkflowResource({ context, type: 'model', id: 'dynamic-model' })).toBe(false);

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      // 命中静态快照的模型不按运行人鉴权。
      await loadWorkflowModelResource({
        modelId: 'static-model-1',
        teamId: 'team-1',
        tmbId: 'tmb-1'
      });
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();

      // 命中静态快照的知识库按 ID 直接读取，且因无 teamId 跳过团队限制。
      await loadWorkflowDatasetResource({ datasetId: 'dataset-2' });
      expect(mocks.mongoDatasetFindOne).toHaveBeenCalledWith({
        _id: 'dataset-2',
        deleteTime: null
      });

      // 工具集不按快照裁剪子工具。
      const tools = [{ name: 'a' }, { name: 'b' }];
      expect(filterWorkflowToolList({ context, appId: 'tool-1', tools })).toBe(tools);

      // 未命中快照的模型按运行人鉴权。
      await loadWorkflowModelResource({
        modelId: 'dynamic-model',
        teamId: 'team-1',
        tmbId: 'tmb-1'
      });
    });

    expect(mocks.assertAuthModels).toHaveBeenCalledExactlyOnceWith({
      actor: { teamId: 'team-1', tmbId: 'tmb-1', isRoot: true },
      modelIds: ['dynamic-model'],
      action: 'use',
      handle: expect.anything()
    });
  });

  it('authorizes only missing dataset IDs and reuses the first loaded entity', async () => {
    const context = createWorkflowResourceContext({
      resources: [{ type: 'dataset', id: 'snapshot' }]
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowDatasetResource({
          datasetId: 'member',
          datasetIds: ['member', 'snapshot'],
          tmbId: 'member'
        })
      ).resolves.toEqual({ _id: 'member' });
    });
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ datasetId: 'member' })
    );
    expect(mocks.mongoDatasetFindOne).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized additional dataset before reading the snapshot entity', async () => {
    mocks.authDatasetByTmbId.mockRejectedValueOnce(DatasetErrEnum.unAuthDataset);
    const context = createWorkflowResourceContext({
      resources: [{ type: 'dataset', id: 'snapshot' }]
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, () =>
      expect(
        loadWorkflowDatasetResource({
          datasetId: 'snapshot',
          datasetIds: ['snapshot', 'forbidden'],
          tmbId: 'member'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDataset)
    );
    expect(mocks.mongoDatasetFindOne).not.toHaveBeenCalled();
  });

  it('propagates database failures instead of reporting a missing snapshot resource', async () => {
    const error = new Error('database unavailable');
    const context = createWorkflowResourceContext({
      resources: [
        { type: 'dataset', id: 'dataset' },
        { type: 'tool', id: 'tool' }
      ]
    });
    mocks.mongoDatasetFindOne.mockReturnValueOnce({ lean: vi.fn().mockRejectedValue(error) });
    const appQuery = vi.spyOn(MongoApp, 'findOne').mockImplementationOnce(() => {
      throw error;
    });
    try {
      await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
        await expect(loadWorkflowDatasetResource({ datasetId: 'dataset' })).rejects.toBe(error);
        await expect(
          loadWorkflowAppResource({ appId: 'tool', type: 'tool', tmbId: 'member' })
        ).rejects.toBe(error);
      });
    } finally {
      appQuery.mockRestore();
    }
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
});

describe('loadWorkflowSkillResources', () => {
  it('rejects a missing declared Skill instead of silently dropping it', async () => {
    const resourceContext = createWorkflowResourceContext({
      resources: [{ type: 'skill', id: 'missing-skill' }]
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext }, () =>
      expect(
        loadWorkflowSkillResources({ skillIds: ['missing-skill'], tmbId: 'member' })
      ).rejects.toBe(SkillErrEnum.unExist)
    );
  });
  it('uses member permission for new Skills and keeps snapshot authorization for existing Skills', async () => {
    const owner = await getUser(`skill-resource-owner-${getNanoid(6)}`);
    const member = await getUser(`skill-resource-member-${getNanoid(6)}`, owner.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'Private Skill',
      source: AgentSkillSourceEnum.personal,
      description: '',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const skillId = String(skill._id);
    await expect(
      loadWorkflowSkillResources({
        skillIds: [skillId, skillId],
        tmbId: member.tmbId
      })
    ).resolves.toEqual([]);
    const resourceContext = createWorkflowResourceContext({
      resources: [{ type: 'skill', id: skillId }],
      teamId: owner.teamId
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext }, async () => {
      const resources = await loadWorkflowSkillResources({
        skillIds: [skillId, skillId],
        tmbId: member.tmbId
      });
      expect(resources.map((skill) => String(skill._id))).toEqual([skillId]);
    });
    const otherTeam = createWorkflowResourceContext({
      resources: [{ type: 'skill', id: skillId }],
      teamId: '65f000000000000000000099'
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: otherTeam }, () =>
      expect(loadWorkflowSkillResources({ skillIds: [skillId], tmbId: member.tmbId })).rejects.toBe(
        SkillErrEnum.unExist
      )
    );
    const root = createWorkflowResourceContext({
      resources: [{ type: 'skill', id: skillId }],
      teamId: '65f000000000000000000099',
      isRoot: true
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: root }, async () => {
      expect(
        await loadWorkflowSkillResources({ skillIds: [skillId], tmbId: member.tmbId })
      ).toHaveLength(1);
    });
  });
});
