import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import {
  loadWorkflowSkillResources,
  loadWorkflowAppResource,
  loadWorkflowDatasetResource,
  loadWorkflowModelResource,
  isWorkflowResourceError,
  WorkflowResourceError
} from '@fastgpt/service/core/workflow/resource/service';
import { getRootUser, getUser } from '@test/datas/users';
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
  getAuthorizedModelIds: vi.fn(),
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
  assertAuthModels: mocks.assertAuthModels,
  getAuthorizedModelIds: mocks.getAuthorizedModelIds
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

describe('WorkflowResourceError', () => {
  it('preserves the error name, message and optional display message', () => {
    const error = new WorkflowResourceError('resource missing', '资源不存在');

    expect(error).toBeInstanceOf(UserError);
    expect(error.name).toBe('WorkflowResourceError');
    expect(error.message).toBe('resource missing');
    expect(error.displayMessage).toBe('资源不存在');
  });
});

describe('isWorkflowResourceError', () => {
  it('recognizes real instances and their serialized representations', () => {
    const error = new WorkflowResourceError('resource missing');

    expect(isWorkflowResourceError(error)).toBe(true);
    expect(isWorkflowResourceError(JSON.parse(JSON.stringify(error)))).toBe(true);
  });

  it.each([new Error('runtime failure'), 'WorkflowResourceError', null, undefined, {}])(
    'rejects unrelated errors and empty values: %s',
    (error) => {
      expect(isWorkflowResourceError(error)).toBe(false);
    }
  );
});

describe('workflow resource context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authDatasetByTmbId.mockImplementation(async ({ datasetId }) => ({
      dataset: { _id: datasetId }
    }));
    mocks.mongoDatasetFind.mockImplementation(({ _id, teamId }) =>
      createFindResult(_id.$in.map((id: string) => ({ _id: id, teamId })))
    );
    mocks.mongoDatasetFindOne.mockReturnValue(createFindResult({ _id: 'dataset-2' }));
    mocks.assertAuthModels.mockResolvedValue({ handle: {}, models: [] });
    mocks.getAuthorizedModelIds.mockResolvedValue(new Set(['default-llm', 'default-rerank']));
    mocks.getSystemModelHandle.mockResolvedValue({
      getActiveModels: () => [],
      getDefaultModelIds: () => ({}),
      getModelData: vi.fn(
        (
          { modelId, model }: { modelId?: string; model?: string },
          { type = 'llm' }: { type?: string } = {}
        ) => ({
          modelId: modelId ?? (type === 'rerank' ? 'rerank-1' : 'model-1'),
          model: model ?? modelId ?? (type === 'rerank' ? 'rerank-1' : 'model-1'),
          name: model ?? modelId ?? (type === 'rerank' ? 'rerank-1' : 'model-1'),
          type,
          config: {}
        })
      ),
      getDefaultModelData: vi.fn((slot: string) => ({
        modelId: `default-${slot}`,
        model: `default-${slot}`,
        name: `default-${slot}`,
        type: slot,
        config: {}
      }))
    });
  });

  it('inherits root ACL privileges while retaining the child workflow team boundary', async () => {
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

    // root 身份继续传递，但读取快照仍按子工作流团队过滤。
    await runWithContext({ mcpClientMemory: {}, resourceContext: childContext }, () =>
      loadWorkflowDatasetResource({ datasetId: 'dataset-2' })
    );

    expect(mocks.mongoDatasetFind).toHaveBeenCalledWith({
      _id: { $in: ['dataset-2'] },
      deleteTime: null,
      teamId: 'child-team'
    });
  });

  it('uses the snapshot when a model hits and falls back to member permissions when it misses', async () => {
    const modelResource = { type: 'model' as const, id: 'model-1' };
    const context = createWorkflowResourceContext({ resources: [modelResource] });

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowModelResource({
          modelId: 'model-1',
          appTeamId: 'team-1',
          userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
        })
      ).resolves.toMatchObject({ modelId: 'model-1' });
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();

      // legacy model 命中快照时直接放行
      await expect(
        loadWorkflowModelResource({
          model: 'legacy-hit',
          appTeamId: 'team-1',
          userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
        })
      ).resolves.toMatchObject({ modelId: 'model-1' });
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();

      await expect(
        loadWorkflowModelResource({
          modelId: 'missing-model',
          appTeamId: 'team-1',
          userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
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

  it('checks every snapshot dataset, including additional IDs, even for root', async () => {
    const context = createWorkflowResourceContext({
      resources: [
        { type: 'dataset', id: 'local' },
        { type: 'dataset', id: 'foreign' }
      ],
      teamId: 'current-team',
      isRoot: true
    });
    mocks.mongoDatasetFind.mockReturnValueOnce(createFindResult([{ _id: 'local' }]));
    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, () =>
      expect(
        loadWorkflowDatasetResource({ datasetId: 'local', datasetIds: ['local', 'foreign'] })
      ).rejects.toBe(DatasetErrEnum.unExist)
    );
    expect(mocks.mongoDatasetFind).toHaveBeenCalledWith({
      _id: { $in: ['local', 'foreign'] },
      deleteTime: null,
      teamId: 'current-team'
    });
  });

  it('preserves root access to same-team dynamic datasets and blocks other teams', async () => {
    const context = createWorkflowResourceContext({
      resources: [],
      teamId: 'current-team',
      isRoot: true
    });
    mocks.authDatasetByTmbId.mockResolvedValueOnce({
      dataset: { _id: 'local', teamId: 'current-team' }
    });
    mocks.authDatasetByTmbId.mockResolvedValueOnce({
      dataset: { _id: 'foreign', teamId: 'other-team' }
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowDatasetResource({ datasetId: 'local', tmbId: 'root' })
      ).resolves.toMatchObject({ _id: 'local' });
      await expect(
        loadWorkflowDatasetResource({ datasetId: 'foreign', tmbId: 'root' })
      ).rejects.toBe(DatasetErrEnum.unAuthDataset);
    });
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ isRoot: true })
    );
  });

  it('rejects a foreign team model from a snapshot without falling back, while system tools keep static access', async () => {
    const handle = await mocks.getSystemModelHandle();
    handle.getModelData.mockReturnValue({
      modelId: 'foreign-model',
      scope: 'team',
      teamId: 'other-team',
      type: 'llm',
      config: {}
    });
    const resources = [{ type: 'model' as const, id: 'foreign-model' }];
    const context = createWorkflowResourceContext({
      resources,
      teamId: 'current-team',
      isRoot: true
    });
    const args = {
      modelId: 'foreign-model',
      appTeamId: 'current-team',
      userInfo: { teamId: 'current-team', tmbId: 'root' },
      fallbackToDefault: true as const
    };
    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, () =>
      expect(loadWorkflowModelResource(args)).rejects.toMatchObject({
        message: ModelErrEnum.unAuthModel
      })
    );
    expect(handle.getDefaultModelData).not.toHaveBeenCalled();
    const systemContext = createWorkflowResourceContext({ resources, isRoot: true });
    await runWithContext({ mcpClientMemory: {}, resourceContext: systemContext }, () =>
      expect(loadWorkflowModelResource(args)).resolves.toMatchObject({ modelId: 'foreign-model' })
    );
  });

  it('limits both snapshot and dynamic App resources to the workflow team for root', async () => {
    const root = await getRootUser();
    const foreignOwner = await getUser(`foreign-app-${getNanoid(6)}`);
    const app = await MongoApp.create({
      name: 'Foreign tool',
      type: AppTypeEnum.workflowTool,
      teamId: foreignOwner.teamId,
      tmbId: foreignOwner.tmbId
    });
    const resource = { type: 'tool' as const, id: String(app._id) };
    for (const snapshot of [false, true]) {
      const context = createWorkflowResourceContext({
        resources: snapshot ? [resource] : [],
        teamId: root.teamId,
        isRoot: true
      });
      await runWithContext({ mcpClientMemory: {}, resourceContext: context }, () => {
        const loaded = loadWorkflowAppResource({
          appId: resource.id,
          type: 'tool',
          tmbId: root.tmbId
        });
        return snapshot
          ? expect(loaded).rejects.toBeInstanceOf(WorkflowResourceError)
          : expect(loaded).rejects.toBe(AppErrEnum.unAuthApp);
      });
    }
  });

  it('authorizes legacy model references against member permissions when snapshot misses', async () => {
    const context = createWorkflowResourceContext({ resources: [] });

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowModelResource({
          model: 'legacy-llm',
          appTeamId: 'team-1',
          userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
        })
      ).resolves.toMatchObject({ modelId: 'model-1' });
    });

    expect(mocks.assertAuthModels).toHaveBeenCalledExactlyOnceWith({
      actor: { teamId: 'team-1', tmbId: 'tmb-1', isRoot: false },
      modelIds: ['model-1'],
      action: 'use',
      handle: expect.anything()
    });
  });

  it('authorizes snapshot-missed models against runner userInfo.teamId instead of appTeamId in cross-team calls', async () => {
    const appHandle = {
      getActiveModels: () => [],
      getDefaultModelIds: () => ({}),
      findModelData: vi.fn(({ modelId }: { modelId?: string }) => ({
        modelId: modelId ?? 'sys-model',
        model: modelId ?? 'sys-model',
        name: modelId ?? 'sys-model',
        type: 'llm',
        config: {}
      })),
      getModelData: vi.fn(({ modelId, model }: { modelId?: string; model?: string }) => ({
        modelId: modelId ?? 'sys-model',
        model: model ?? modelId ?? 'sys-model',
        name: model ?? modelId ?? 'sys-model',
        type: 'llm',
        config: {}
      })),
      getDefaultModelData: vi.fn()
    };
    const runnerHandle = {
      ...appHandle,
      findModelData: vi.fn(({ modelId }: { modelId?: string }) => ({
        modelId: modelId ?? 'sys-model',
        model: modelId ?? 'sys-model',
        name: modelId ?? 'sys-model',
        type: 'llm',
        config: {}
      })),
      getModelData: vi.fn(({ modelId, model }: { modelId?: string; model?: string }) => ({
        modelId: modelId ?? 'sys-model',
        model: model ?? modelId ?? 'sys-model',
        name: model ?? modelId ?? 'sys-model',
        type: 'llm',
        config: {}
      }))
    };

    mocks.getSystemModelHandle.mockImplementation(async ({ teamId }: { teamId?: string } = {}) =>
      teamId === 'runner-team' ? runnerHandle : appHandle
    );
    // 模拟系统模型在 app-team 默认开放，但在 runner-team 配置了 ACL 且未授权给 runner-tmb
    mocks.assertAuthModels.mockImplementation(async ({ actor, handle }) => {
      if (actor.teamId === 'runner-team' && handle === runnerHandle) {
        throw new UserError(ModelErrEnum.unAuthModel);
      }
      return { handle, models: [] };
    });

    const context = createWorkflowResourceContext({
      resources: [{ type: 'model', id: 'snapshot-model' }],
      teamId: 'app-team'
    });

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      // 命中子应用快照的模型按 appTeamId 目录放行，不触发运行人鉴权
      await expect(
        loadWorkflowModelResource({
          modelId: 'snapshot-model',
          appTeamId: 'app-team',
          userInfo: { teamId: 'runner-team', tmbId: 'runner-tmb' }
        })
      ).resolves.toMatchObject({ modelId: 'snapshot-model' });
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();

      // 未命中快照的模型必须使用 runner-team 与 runnerHandle 鉴权，拒绝未授权模型
      await expect(
        loadWorkflowModelResource({
          modelId: 'restricted-system-model',
          appTeamId: 'app-team',
          userInfo: { teamId: 'runner-team', tmbId: 'runner-tmb' }
        })
      ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
    });

    expect(mocks.assertAuthModels).toHaveBeenCalledExactlyOnceWith({
      actor: { teamId: 'runner-team', tmbId: 'runner-tmb', isRoot: false },
      modelIds: ['restricted-system-model'],
      action: 'use',
      handle: runnerHandle
    });
  });

  it('falls back to default model on ModelConfigError when fallbackToDefault is true, but rethrows permission errors', async () => {
    const context = createWorkflowResourceContext({
      resources: [{ type: 'model', id: 'deleted-static-model' }]
    });
    const handle = await mocks.getSystemModelHandle();

    handle.getModelData.mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unExist);
    });
    mocks.assertAuthModels.mockRejectedValueOnce(new UserError(ModelErrEnum.unAuthModel));

    await runWithContext({ mcpClientMemory: {}, resourceContext: context }, async () => {
      await expect(
        loadWorkflowModelResource({
          modelId: 'deleted-static-model',
          type: 'rerank',
          fallbackToDefault: true,
          appTeamId: 'team-1',
          userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
        })
      ).resolves.toMatchObject({ modelId: 'default-rerank' });

      await expect(
        loadWorkflowModelResource({
          modelId: 'unauthorized-runtime-model',
          type: 'rerank',
          fallbackToDefault: true,
          appTeamId: 'team-1',
          userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
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
        appTeamId: 'team-1',
        userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
      });
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();

      // 命中静态快照的知识库按 ID 直接读取，且因无 teamId 跳过团队限制。
      await loadWorkflowDatasetResource({ datasetId: 'dataset-2' });
      expect(mocks.mongoDatasetFind).toHaveBeenCalledWith({
        _id: { $in: ['dataset-2'] },
        deleteTime: null
      });

      // 工具集不按快照裁剪子工具。
      const tools = [{ name: 'a' }, { name: 'b' }];
      expect(filterWorkflowToolList({ context, appId: 'tool-1', tools })).toBe(tools);

      // 未命中快照的模型按运行人鉴权。
      await loadWorkflowModelResource({
        modelId: 'dynamic-model',
        appTeamId: 'team-1',
        userInfo: { teamId: 'team-1', tmbId: 'tmb-1' }
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
    mocks.mongoDatasetFind.mockReturnValueOnce({ lean: vi.fn().mockRejectedValue(error) });
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
    await runWithContext({ mcpClientMemory: {}, resourceContext: root }, () =>
      expect(loadWorkflowSkillResources({ skillIds: [skillId], tmbId: member.tmbId })).rejects.toBe(
        SkillErrEnum.unExist
      )
    );
    const dynamicRoot = createWorkflowResourceContext({
      resources: [],
      teamId: '65f000000000000000000099',
      isRoot: true
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: dynamicRoot }, () =>
      expect(
        loadWorkflowSkillResources({ skillIds: [skillId], tmbId: member.tmbId })
      ).resolves.toEqual([])
    );
    const sameTeamRoot = createWorkflowResourceContext({
      resources: [],
      teamId: owner.teamId,
      isRoot: true
    });
    await runWithContext({ mcpClientMemory: {}, resourceContext: sameTeamRoot }, () =>
      expect(
        loadWorkflowSkillResources({ skillIds: [skillId], tmbId: member.tmbId })
      ).resolves.toHaveLength(1)
    );
  });
});
