import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  getAppDraftResourceBaseline,
  prepareAppWorkflowResources,
  authTargetModelResource,
  resolveAppResourcesByPermission
} from '@fastgpt/service/core/app/resource/service';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';

import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AIModelDataSchema } from '@fastgpt/global/core/ai/model/schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { createModelHandle, type ModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppLatestVersion: vi.fn(),
  getAppDraftVersion: vi.fn(),
  getTeamModelHandle: vi.fn(),
  authAppByTmbId: vi.fn(),
  authDatasetByTmbId: vi.fn(),
  authSkillByTmbId: vi.fn(),
  getTmbInfoByTmbId: vi.fn(),
  mongoAppFindById: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion,
  getAppDraftVersion: mocks.getAppDraftVersion
}));

vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();
  return {
    ...actual,
    MongoApp: {
      findById: mocks.mongoAppFindById,
      find: actual.MongoApp.find.bind(actual.MongoApp)
    }
  };
});

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: mocks.authAppByTmbId
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mocks.authDatasetByTmbId
}));

vi.mock('@fastgpt/service/support/permission/skill/auth', () => ({
  authSkillByTmbId: mocks.authSkillByTmbId
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mocks.getTmbInfoByTmbId
}));

import {
  checkAppResourceReadPermissions,
  getUnauthorizedAppResources,
  getAppResourcesOutsideTeam
} from '@fastgpt/service/support/permission/app/resource';

describe('resource snapshots stay within their team', () => {
  const teamId = '65f000000000000000000002';
  const otherTeamId = '65f000000000000000000003';
  const tmbId = '65f000000000000000000001';

  it('validates all resource types while preserving global models and system Skills', async () => {
    // MongoApp 只替换了 findById；归属查询使用真实数据库，避免 ACL mock 掩盖团队边界。
    const { MongoApp } = await vi.importActual<typeof import('@fastgpt/service/core/app/schema')>(
      '@fastgpt/service/core/app/schema'
    );
    const app = await MongoApp.create({
      name: 'Foreign app',
      type: AppTypeEnum.workflow,
      teamId: otherTeamId,
      tmbId
    });
    const dataset = await MongoDataset.create({
      name: 'Foreign dataset',
      teamId: otherTeamId,
      tmbId
    });
    const skill = await MongoAgentSkills.create({
      name: 'Foreign Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: otherTeamId,
      tmbId
    });
    const systemSkill = await MongoAgentSkills.create({
      name: 'System Skill',
      source: AgentSkillSourceEnum.system,
      tmbId
    });
    const models = ['system', 'team'].map((scope) =>
      AIModelDataSchema.parse({
        scope,
        teamId: scope === 'team' ? otherTeamId : undefined,
        tmbId: scope === 'team' ? tmbId : undefined,
        modelId: `${scope}-model`,
        model: scope,
        name: scope,
        provider: 'OpenAI',
        type: 'llm',
        config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
      })
    );
    const handle = createModelHandle({
      models,
      configuredDefaultModelIds: {},
      revision: 1,
      version: 'scope-test'
    });
    const foreign = [
      { type: 'agent' as const, id: String(app._id) },
      { type: 'tool' as const, id: String(app._id) },
      { type: 'dataset' as const, id: String(dataset._id) },
      { type: 'skill' as const, id: String(skill._id) },
      { type: 'model' as const, id: 'team-model' }
    ];
    const global = [
      { type: 'model' as const, id: 'system-model' },
      { type: 'skill' as const, id: String(systemSkill._id) }
    ];
    const denied = await getAppResourcesOutsideTeam({
      resources: [...foreign, ...global],
      teamId,
      modelHandle: handle
    });
    expect(denied).toHaveLength(foreign.length);
    expect(denied).toEqual(
      expect.arrayContaining(
        foreign.map((resource, index) => ({
          resource,
          error: [
            AppErrEnum.unAuthApp,
            AppErrEnum.unAuthApp,
            DatasetErrEnum.unAuthDataset,
            SkillErrEnum.unAuthSkill,
            ERROR_ENUM.unAuthModel
          ][index]
        }))
      )
    );
    await expect(
      getAppResourcesOutsideTeam({
        resources: [...foreign, ...global],
        teamId: otherTeamId,
        modelHandle: handle
      })
    ).resolves.toEqual([]);
  });

  it('blocks root debug on a foreign dataset already present in the draft and strips it on save', async () => {
    const dataset = await MongoDataset.create({
      name: 'Old foreign reference',
      teamId: otherTeamId,
      tmbId
    });
    const resources = [{ type: 'dataset' as const, id: String(dataset._id) }];
    mocks.getAppDraftVersion.mockResolvedValue({ resources });
    const args = { appId: 'app', teamId, tmbId, isRoot: true, extracted: resources };
    await expect(
      resolveAppResourcesByPermission({ ...args, blockOnUnauthorized: true })
    ).rejects.toBe(DatasetErrEnum.unAuthDataset);
    await expect(
      resolveAppResourcesByPermission({ ...args, blockOnUnauthorized: false })
    ).resolves.toEqual([]);
    await expect(
      resolveAppResourcesByPermission({ ...args, teamId: otherTeamId, blockOnUnauthorized: true })
    ).resolves.toEqual(resources);
  });
});

describe('authTargetModelResource', () => {
  // App 分支只看版本快照，不读取 handle。
  const memberArgs = {
    teamId: 'team-1',
    tmbId: 'tmb-1',
    isRoot: false,
    handle: {} as ModelHandle
  };
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a model that is declared in the published App version snapshot', async () => {
    mocks.getAppLatestVersion.mockResolvedValue({
      resources: [{ type: 'model', id: 'declared-model' }]
    });

    await expect(
      authTargetModelResource({
        targetType: ChatSourceTypeEnum.app,
        targetId: 'app-1',
        modelId: 'declared-model',
        ...memberArgs
      })
    ).resolves.toBeUndefined();
  });

  it('rejects a model that is missing from the published App version snapshot', async () => {
    mocks.getAppLatestVersion.mockResolvedValue({
      resources: [{ type: 'model', id: 'other-model' }]
    });

    await expect(
      authTargetModelResource({
        targetType: ChatSourceTypeEnum.app,
        targetId: 'app-1',
        modelId: 'undeclared-model',
        ...memberArgs
      })
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
  });

  it('uses explicitly passed snapshot resources when available', async () => {
    await expect(
      authTargetModelResource({
        targetType: ChatSourceTypeEnum.app,
        targetId: 'app-1',
        modelId: 'declared-model',
        ...memberArgs,
        resources: [{ type: 'model', id: 'declared-model' }]
      })
    ).resolves.toBeUndefined();

    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });
});

describe('team models in App resource permissions', () => {
  const teamId = '65f000000000000000000002';
  const tmbId = '65f000000000000000000001';
  const ownId = '65f000000000000000000011';
  const disabledId = '65f000000000000000000012';
  const privateId = '65f000000000000000000013';
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTmbInfoByTmbId.mockResolvedValue({ teamId, permission: { hasManagePer: false } });
    const models = [
      { modelId: ownId, tmbId, isActive: true },
      { modelId: disabledId, tmbId, isActive: false },
      { modelId: privateId, tmbId: '65f000000000000000000099', isActive: true }
    ].map((model) =>
      AIModelDataSchema.parse({
        ...model,
        model: model.modelId,
        name: 'Private model',
        provider: 'OpenAI',
        type: 'llm',
        scope: 'team',
        teamId,
        config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
      })
    );
    mocks.getTeamModelHandle.mockResolvedValue(
      createModelHandle({
        models,
        defaultModels: {},
        configuredDefaultModelIds: {},
        revision: 1,
        version: 'app-resource-team-catalog'
      })
    );
  });

  it('allows an owned team model through ID authorization', async () => {
    await expect(
      checkAppResourceReadPermissions({ resources: [{ type: 'model', id: ownId }], tmbId })
    ).resolves.toBeUndefined();
  });
  it('distinguishes a disabled model from another member private model in the same snapshot', async () => {
    const disabled = { type: 'model' as const, id: disabledId };
    const privateModel = { type: 'model' as const, id: privateId };
    expect(
      await getUnauthorizedAppResources({ resources: [disabled, privateModel], tmbId })
    ).toEqual([
      { resource: disabled, error: ModelErrEnum.unExist },
      { resource: privateModel, error: ERROR_ENUM.unAuthModel }
    ]);
  });

  it('authorizes non-App targets with the caller handle instead of the App resource pipeline', async () => {
    const handle = await mocks.getTeamModelHandle();
    mocks.getTeamModelHandle.mockClear();
    const args = {
      targetType: ChatSourceTypeEnum.skillEdit,
      targetId: 'skill-1',
      teamId,
      tmbId,
      isRoot: false,
      handle
    };

    await expect(authTargetModelResource({ ...args, modelId: ownId })).resolves.toBeUndefined();
    await expect(authTargetModelResource({ ...args, modelId: privateId })).rejects.toMatchObject({
      message: ModelErrEnum.unAuthModel
    });
    // root 也不能使用其他成员的团队模型。
    await expect(
      authTargetModelResource({ ...args, isRoot: true, modelId: privateId })
    ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
    expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });

  describe('App target follows the debug resource chain', () => {
    const appId = '65f000000000000000000071';
    const getArgs = async (authType?: 'token' | 'outLink') => {
      const handle = await mocks.getTeamModelHandle();
      mocks.getTeamModelHandle.mockClear();
      return {
        targetType: ChatSourceTypeEnum.app,
        targetId: appId,
        teamId,
        tmbId,
        isRoot: false,
        authType,
        handle,
        resources: []
      };
    };

    it('allows a token member to use a model declared by the draft snapshot baseline', async () => {
      mocks.getAppDraftVersion.mockResolvedValue({ resources: [{ type: 'model', id: privateId }] });

      await expect(
        authTargetModelResource({ ...(await getArgs('token')), modelId: privateId })
      ).resolves.toBeUndefined();
      expect(mocks.getAppDraftVersion).toHaveBeenCalledWith(appId, undefined);
    });

    it('authorizes models added relative to the draft with the member use permission', async () => {
      mocks.getAppDraftVersion.mockResolvedValue({ resources: [] });
      const args = await getArgs('token');

      await expect(authTargetModelResource({ ...args, modelId: ownId })).resolves.toBeUndefined();
      await expect(authTargetModelResource({ ...args, modelId: privateId })).rejects.toBe(
        ERROR_ENUM.unAuthModel
      );
      // 复用调用方 handle，不重复读取模型目录。
      expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
    });

    it('rejects non-token identities without falling back to the draft snapshot', async () => {
      await expect(
        authTargetModelResource({ ...(await getArgs('outLink')), modelId: ownId })
      ).rejects.toMatchObject({ message: ModelErrEnum.unAuthModel });
      expect(mocks.getAppDraftVersion).not.toHaveBeenCalled();
    });
  });
});

describe('getAppDraftResourceBaseline', () => {
  const appId = '65f000000000000000000071';
  const ownerId = '65f000000000000000000072';
  const datasetId = '65f000000000000000000073';
  const sessionQuery = { session: vi.fn(), lean: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppDraftVersion.mockReset();
    sessionQuery.session.mockReturnValue(sessionQuery);
    sessionQuery.lean.mockResolvedValue({ tmbId: ownerId });
    mocks.mongoAppFindById.mockReturnValue(sessionQuery);
    mocks.getTmbInfoByTmbId.mockResolvedValue({ teamId: 'team', permission: {} });
    mocks.authDatasetByTmbId.mockReset().mockResolvedValue({ dataset: { teamId: 'team' } });
  });
  const legacyDraft = () => ({
    nodes: [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            value: [{ datasetId }],
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
          }
        ]
      }
    ]
  });

  it('uses empty or valid stored snapshots without reading the App owner', async () => {
    for (const resources of [[], [{ type: 'dataset', id: datasetId }]]) {
      mocks.getAppDraftVersion.mockResolvedValue({ resources });
      await expect(getAppDraftResourceBaseline({ appId })).resolves.toEqual(resources);
    }
    expect(mocks.mongoAppFindById).not.toHaveBeenCalled();
  });
  it('keeps an invalid stored array empty even if nodes contain resources', async () => {
    mocks.getAppDraftVersion.mockResolvedValue({
      ...legacyDraft(),
      resources: [{ type: 'invalid', id: datasetId }]
    });
    await expect(getAppDraftResourceBaseline({ appId })).resolves.toEqual([]);
    expect(mocks.mongoAppFindById).not.toHaveBeenCalled();
  });
  it('filters a missing snapshot by the App owner before using it as a baseline', async () => {
    mocks.getAppDraftVersion.mockResolvedValue(legacyDraft());
    await expect(getAppDraftResourceBaseline({ appId })).resolves.toEqual([
      { type: 'dataset', id: datasetId }
    ]);
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId: ownerId, datasetId })
    );
    mocks.authDatasetByTmbId.mockRejectedValueOnce(DatasetErrEnum.unAuthDataset);
    await expect(getAppDraftResourceBaseline({ appId })).resolves.toEqual([]);
  });
  it('returns no baseline when draft or owner is missing and propagates storage errors', async () => {
    mocks.getAppDraftVersion.mockResolvedValue(null);
    await expect(getAppDraftResourceBaseline({ appId })).resolves.toEqual([]);
    mocks.getAppDraftVersion.mockResolvedValue(legacyDraft());
    sessionQuery.lean.mockResolvedValue(null);
    await expect(getAppDraftResourceBaseline({ appId })).resolves.toEqual([]);
    const error = new Error('database unavailable');
    mocks.getAppDraftVersion.mockRejectedValue(error);
    await expect(getAppDraftResourceBaseline({ appId })).rejects.toBe(error);
  });
});

describe('prepareAppWorkflowResources', () => {
  const teamId = '65f000000000000000000002';
  const tmbId = '65f000000000000000000001';
  const model = { modelId: 'resolved-model-id', model: 'legacy-llm', type: ModelTypeEnum.llm };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTmbInfoByTmbId.mockResolvedValue({ teamId, permission: { hasManagePer: false } });
    mocks.getAppDraftVersion.mockResolvedValue({
      resources: [{ type: 'model', id: model.modelId }]
    });
    mocks.getTeamModelHandle.mockResolvedValue({
      version: 'prepare-catalog',
      getActiveModels: () => [model],
      getAllModels: () => [model],
      getSystemModels: () => [model],
      getTeamModels: () => [],
      getDefaultModelIds: () => ({})
    });
  });
  it.each([true, false])(
    'keeps root debug resource references in the target team: sameTeam=%s',
    async (sameTeam) => {
      const datasetId = '65f000000000000000000073';
      mocks.getAppDraftVersion.mockResolvedValue({ resources: [] });
      mocks.authDatasetByTmbId.mockResolvedValue({
        dataset: { teamId: sameTeam ? teamId : 'other-team' }
      });
      const prepared = prepareAppWorkflowResources({
        appId: 'app',
        teamId,
        tmbId,
        isRoot: true,
        nodes: [
          {
            nodeId: 'search',
            name: 'Search',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            outputs: [],
            inputs: [
              {
                key: NodeInputKeyEnum.datasetSelectList,
                value: [{ datasetId }],
                renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
              }
            ]
          }
        ] as any
      });
      if (sameTeam) {
        await expect(prepared).resolves.toEqual([{ type: 'dataset', id: datasetId }]);
      } else {
        await expect(prepared).rejects.toBe(DatasetErrEnum.unAuthDataset);
      }
    }
  );
  it.each([NodeInputKeyEnum.aiModel, NodeInputKeyEnum.aiModelId])(
    'prepares a dynamic %s without authorizing the expression as a model ID',
    async (key) => {
      await expect(
        prepareAppWorkflowResources({
          appId: 'app',
          teamId,
          tmbId,
          nodes: [
            {
              nodeId: 'chat',
              name: 'Chat',
              flowNodeType: FlowNodeTypeEnum.chatNode,
              inputs: [
                { key, value: '{{selectedModel}}', renderTypeList: [FlowNodeInputTypeEnum.hidden] }
              ],
              outputs: []
            }
          ]
        })
      ).resolves.toEqual([]);
    }
  );

  it('normalizes a legacy model and returns authorized resources without creating Workflow context', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: model.model,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ]
      }
    ];
    const resources = await prepareAppWorkflowResources({
      appId: 'app',
      nodes: nodes as any,
      teamId,
      tmbId
    });
    expect(resources).toEqual([{ type: 'model', id: model.modelId }]);
    expect(nodes[0].inputs[0]).toMatchObject({
      key: NodeInputKeyEnum.aiModelId,
      value: model.modelId
    });
    expect(mocks.mongoAppFindById).not.toHaveBeenCalled();
  });
});
