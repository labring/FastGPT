import handler from '@/pages/api/core/app/version/publish';
import datasetListHandler from '@/pages/api/core/dataset/listV2';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { RerankModelDataType, TTSModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import type { PublishAppBodyType } from '@fastgpt/global/openapi/core/app/version/api';
import type {
  GetDatasetListV2Body,
  GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getCachedSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/cache';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getWorkflowNodeRunParams } from '@fastgpt/service/core/workflow/dispatch/utils/runtime';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { createWorkflowResourceContext } from '@fastgpt/service/core/workflow/resource/context';
import {
  loadWorkflowDatasetResource,
  loadWorkflowModelResource
} from '@fastgpt/service/core/workflow/resource/service';
import { prepareAppWorkflowResources } from '@fastgpt/service/core/app/resource/service';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getRootUser, getUser } from '@test/datas/users';
import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('publish manually selected datasets', () => {
  const createDatasetNode = (
    datasetId: string,
    nodeId = 'search'
  ): NonNullable<PublishAppBodyType['nodes']>[number] => ({
    nodeId,
    name: 'Search',
    flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
    outputs: [],
    inputs: [
      {
        key: NodeInputKeyEnum.datasetSelectList,
        label: 'Datasets',
        renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
        value: [{ datasetId }]
      }
    ]
  });

  /** 每次创建目标团队的独立应用，使三个场景只描述各自的资源和保存边界。 */
  const createAppInAnotherTeam = async () => {
    const root = await getRootUser();
    const owner = await getUser('target-app-owner');
    const app = await MongoApp.create({
      name: 'Application in another team',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    return { root, owner, app };
  };

  it.each([
    { isRoot: true, sameTeam: true, granted: false, isPublish: true, allowed: true },
    { isRoot: true, sameTeam: true, granted: false, isPublish: false, allowed: true },
    { isRoot: false, sameTeam: true, granted: true, isPublish: true, allowed: true },
    { isRoot: false, sameTeam: true, granted: false, isPublish: true, allowed: false },
    { isRoot: true, sameTeam: false, granted: false, isPublish: true, allowed: false }
  ])('keeps selection and save permissions consistent: %j', async (scenario) => {
    const publisher = scenario.isRoot
      ? await getRootUser()
      : await getUser('dataset-publisher', (await getUser('dataset-team-owner')).teamId);
    const creator = await getUser(
      'dataset-creator',
      scenario.sameTeam ? publisher.teamId : undefined
    );
    const dataset = await MongoDataset.create({
      name: 'Manually selected dataset',
      teamId: creator.teamId,
      tmbId: creator.tmbId,
      type: DatasetTypeEnum.dataset
    });
    if (scenario.granted) {
      await MongoResourcePermission.create({
        teamId: publisher.teamId,
        tmbId: publisher.tmbId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: dataset._id,
        permission: ReadPermissionVal
      });
    }

    const listed = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(datasetListHandler, {
      auth: publisher,
      body: { parentId: null }
    });
    expect(listed.code).toBe(200);
    expect(listed.data.list.some((item) => String(item._id) === String(dataset._id))).toBe(
      scenario.allowed
    );

    const app = await MongoApp.create({
      name: 'Dataset permission consistency',
      type: AppTypeEnum.workflow,
      teamId: publisher.teamId,
      tmbId: publisher.tmbId
    });
    const result = await Call<PublishAppBodyType>(handler, {
      auth: publisher,
      query: { appId: String(app._id) },
      body: {
        isPublish: scenario.isPublish,
        nodes: [createDatasetNode(String(dataset._id))]
      }
    });
    const version = await MongoAppVersion.findOne({ appId: app._id }).lean();
    if (scenario.allowed) {
      expect(result.code, JSON.stringify(result)).toBe(200);
      expect(version?.resources).toEqual([{ type: 'dataset', id: String(dataset._id) }]);
    } else {
      expect(result.code).not.toBe(200);
      expect(result.error).toBe(DatasetErrEnum.unAuthDataset);
      expect(version).toBeNull();
      expect((await MongoApp.findById(app._id).lean())?.publishedVersionId).toBeUndefined();
    }
  });

  it('rejects a foreign dataset in an old authorized snapshot and removes it from autosave authorization', async () => {
    const root = await getRootUser();
    const other = await getUser('old-cross-team-dataset-owner');
    const dataset = await MongoDataset.create({
      name: 'Old foreign dataset',
      teamId: other.teamId,
      tmbId: other.tmbId
    });
    const app = await MongoApp.create({
      name: 'Old root snapshot',
      type: AppTypeEnum.workflow,
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    const body: PublishAppBodyType = {
      isPublish: true,
      nodes: [createDatasetNode(String(dataset._id))]
    };
    await MongoAppVersion.create({
      appId: app._id,
      tmbId: root.tmbId,
      nodes: body.nodes,
      edges: [],
      resources: [{ type: 'dataset', id: String(dataset._id) }]
    });
    const publish = await Call<PublishAppBodyType>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body
    });
    expect(publish.error).toBe(DatasetErrEnum.unAuthDataset);
    expect(await MongoAppVersion.countDocuments({ appId: app._id })).toBe(1);
    expect((await MongoApp.findById(app._id).lean())?.publishedVersionId).toBeUndefined();

    const saved = await Call<PublishAppBodyType>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body: { ...body, isPublish: false, autoSave: true }
    });
    expect(saved.code, JSON.stringify(saved)).toBe(200);
    const draft = await MongoAppVersion.findOne({ appId: app._id, isAutoSave: true }).lean();
    expect(draft?.resources).toEqual([]);
    expect(draft?.nodes).toHaveLength(1);
  });

  it('uses the application team when root publishes an application from another team', async () => {
    const { root, owner, app } = await createAppInAnotherTeam();
    const dataset = await MongoDataset.create({
      name: 'Application team dataset',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    const result = await Call<PublishAppBodyType>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body: { isPublish: true, nodes: [createDatasetNode(String(dataset._id))] }
    });

    expect(result.code, JSON.stringify(result)).toBe(200);
    const version = await getAppLatestVersion(String(app._id));
    expect(version.resources).toEqual([{ type: 'dataset', id: String(dataset._id) }]);
    const loadedDataset = await runWithContext(
      {
        mcpClientMemory: {},
        resourceContext: createWorkflowResourceContext({
          resources: version.resources,
          teamId: owner.teamId
        })
      },
      () => loadWorkflowDatasetResource({ datasetId: String(dataset._id), tmbId: owner.tmbId })
    );
    expect(String(loadedDataset._id)).toBe(String(dataset._id));
  });

  it.each([false, true])(
    'rejects root login-team resources in another application team, including snapshots (%s)',
    async (hasSnapshot) => {
      const { root, app } = await createAppInAnotherTeam();
      const dataset = await MongoDataset.create({
        name: 'Root login-team dataset',
        teamId: root.teamId,
        tmbId: root.tmbId
      });
      const nodes = [createDatasetNode(String(dataset._id))];
      if (hasSnapshot) {
        await MongoAppVersion.create({
          appId: app._id,
          tmbId: root.tmbId,
          nodes,
          edges: [],
          resources: [{ type: 'dataset', id: String(dataset._id) }]
        });
      }

      const result = await Call<PublishAppBodyType>(handler, {
        auth: root,
        query: { appId: String(app._id) },
        body: { isPublish: true, nodes }
      });

      expect(result.error).toBe(DatasetErrEnum.unAuthDataset);
      expect(await MongoAppVersion.countDocuments({ appId: app._id })).toBe(hasSnapshot ? 1 : 0);
      expect((await MongoApp.findById(app._id).lean())?.publishedVersionId).toBeUndefined();
    }
  );

  it.each([false, true])(
    'retains only application-team authorization when root saves another team application (%s)',
    async (autoSave) => {
      const { root, owner, app } = await createAppInAnotherTeam();
      const [appDataset, loginDataset] = await MongoDataset.create([
        { name: 'Application team dataset', teamId: owner.teamId, tmbId: owner.tmbId },
        { name: 'Root login-team dataset', teamId: root.teamId, tmbId: root.tmbId }
      ]);
      const nodes = [
        createDatasetNode(String(appDataset._id)),
        createDatasetNode(String(loginDataset._id), 'foreign-search')
      ];
      const baseline = await MongoAppVersion.create({
        appId: app._id,
        tmbId: root.tmbId,
        nodes,
        edges: [],
        resources: [{ type: 'dataset', id: String(loginDataset._id) }]
      });

      const result = await Call<PublishAppBodyType>(handler, {
        auth: root,
        query: { appId: String(app._id) },
        body: { isPublish: false, autoSave, nodes }
      });

      expect(result.code, JSON.stringify(result)).toBe(200);
      const draft = await MongoAppVersion.findOne({
        appId: app._id,
        _id: { $ne: baseline._id }
      }).lean();
      expect(draft?.resources).toEqual([{ type: 'dataset', id: String(appDataset._id) }]);
      expect(draft?.nodes).toHaveLength(2);
    }
  );
});

describe('publish optional model defaults', () => {
  let previousModels: ReturnType<
    NonNullable<ReturnType<typeof getCachedSystemModelHandle>>['getActiveModels']
  >;
  let previousDefaults: ReturnType<typeof getModelTestDefaults>;
  beforeEach(() => {
    previousModels = getCachedSystemModelHandle()!.getActiveModels();
    previousDefaults = getModelTestDefaults();
    const llm = previousDefaults.llm!;
    const rerank: RerankModelDataType = {
      ...llm,
      modelId: 'default-rerank',
      model: 'rerank',
      type: ModelTypeEnum.rerank,
      config: {}
    };
    const tts: TTSModelDataType = {
      ...llm,
      modelId: 'default-tts',
      model: 'tts',
      type: ModelTypeEnum.tts,
      config: { voices: [{ label: 'Voice', value: 'voice' }] }
    };
    setModelTestSnapshot({ models: [llm, rerank, tts] });
    setModelTestSnapshot({ defaultModels: { llm, rerank, tts } });
  });
  afterEach(() => {
    setModelTestSnapshot({ models: previousModels });
    setModelTestSnapshot({ defaultModels: previousDefaults });
  });

  const makeBody = (enabled: boolean, value?: string | null): PublishAppBodyType => ({
    isPublish: true,
    versionName: 'Model defaults',
    edges: [],
    nodes: [
      {
        nodeId: 'search',
        name: 'Search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        outputs: [],
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchUsingReRank,
            label: 'Rerank',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: enabled
          },
          {
            key: NodeInputKeyEnum.datasetSearchRerankModelId,
            label: 'Rerank model',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value
          },
          {
            key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
            label: 'Query extension',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: enabled
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModelId,
            label: 'Query model',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value
          }
        ]
      }
    ],
    chatConfig: {
      questionGuide: { open: enabled, modelId: value ?? undefined },
      ttsConfig: { type: enabled ? 'model' : 'none', modelId: value ?? undefined }
    }
  });

  /** 应用属于发布成员，但系统默认模型仅授权给另一成员，验证应用权限不能替代模型权限。 */
  const createRestrictedModelScenario = async () => {
    const owner = await getUser('model-owner');
    const member = await getUser('model-publisher', owner.teamId);
    const restrictedModel = {
      ...previousDefaults.llm!,
      modelId: '68ad85a7463006c963799a01',
      model: 'restricted-model'
    };
    const availableModel = {
      ...restrictedModel,
      modelId: '68ad85a7463006c963799a02',
      model: 'available-model'
    };
    setModelTestSnapshot({ models: [restrictedModel, availableModel] });
    setModelTestSnapshot({ defaultModels: { llm: restrictedModel } });
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      resourceType: PerResourceTypeEnum.model,
      resourceId: restrictedModel.modelId,
      permission: ReadPermissionVal
    });
    const app = await MongoApp.create({
      name: 'member-model-permissions',
      type: AppTypeEnum.workflow,
      teamId: member.teamId,
      tmbId: member.tmbId
    });
    return { owner, member, app, restrictedModel, availableModel };
  };

  it('rejects an active model outside the publishing member permissions without writing a version', async () => {
    const { member, app, restrictedModel } = await createRestrictedModelScenario();
    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: {
        isPublish: true,
        nodes: [],
        chatConfig: { questionGuide: { open: true, modelId: restrictedModel.modelId } }
      }
    });
    expect(result.code).not.toBe(200);
    expect(await MongoAppVersion.countDocuments({ appId: app._id })).toBe(0);
    expect((await MongoApp.findById(app._id).lean())?.publishedVersionId).toBeUndefined();
  });

  it('replaces a restricted system default with an authorized fallback model', async () => {
    const { member, app, availableModel } = await createRestrictedModelScenario();
    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: { isPublish: true, nodes: [], chatConfig: { questionGuide: { open: true } } }
    });
    expect(result.code).toBe(200);
    const version = await MongoAppVersion.findOne({ appId: app._id, isPublish: true }).lean();
    expect(version?.chatConfig?.questionGuide?.modelId).toBe(availableModel.modelId);
    expect(version?.resources).toEqual([{ type: 'model', id: availableModel.modelId }]);
  });

  it('rejects publishing when no permitted fallback exists', async () => {
    const { member, app, restrictedModel } = await createRestrictedModelScenario();
    setModelTestSnapshot({ models: [restrictedModel] });
    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: { isPublish: true, nodes: [], chatConfig: { questionGuide: { open: true } } }
    });
    expect(result.code).not.toBe(200);
    expect(await MongoAppVersion.countDocuments({ appId: app._id })).toBe(0);
  });

  it('allows publishing a baseline model after the collaborator loses personal access', async () => {
    const { member, app, restrictedModel } = await createRestrictedModelScenario();
    await MongoAppVersion.create({
      appId: app._id,
      tmbId: member.tmbId,
      nodes: [],
      edges: [],
      chatConfig: { questionGuide: { open: true, modelId: restrictedModel.modelId } },
      resources: [{ type: 'model', id: restrictedModel.modelId }],
      versionName: 'Authorized draft'
    });

    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: {
        isPublish: true,
        nodes: [],
        chatConfig: { questionGuide: { open: true, modelId: restrictedModel.modelId } }
      }
    });

    expect(result.code).toBe(200);
    expect(
      (await MongoAppVersion.findOne({ appId: app._id, isPublish: true }).lean())?.resources
    ).toEqual([{ type: 'model', id: restrictedModel.modelId }]);
  });

  it('preserves restricted model references when saving a draft', async () => {
    const { member, app, restrictedModel } = await createRestrictedModelScenario();
    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: {
        isPublish: false,
        autoSave: true,
        nodes: [],
        chatConfig: { questionGuide: { open: true, modelId: restrictedModel.modelId } }
      }
    });
    expect(result.code).toBe(200);
    const version = await MongoAppVersion.findOne({ appId: app._id, isAutoSave: true }).lean();
    expect(version?.chatConfig?.questionGuide?.modelId).toBe(restrictedModel.modelId);
    expect(version?.resources).toEqual([]);
  });

  it.each([undefined, null, '', '   '])(
    'persists real default IDs in both the app and published version (%s)',
    async (value) => {
      const root = await getRootUser();
      const app = await MongoApp.create({
        name: 'publish-models',
        type: AppTypeEnum.workflow,
        teamId: root.teamId,
        tmbId: root.tmbId
      });
      const body = makeBody(true, value);
      // HTTP 入参也覆盖 null，而不是只在节点 value 中模拟。
      if (value === null) {
        Object.assign(body.chatConfig!.questionGuide!, { modelId: null });
        Object.assign(body.chatConfig!.ttsConfig!, { modelId: null });
      }
      const result = await Call<PublishAppBodyType, { appId: string }, undefined>(handler, {
        auth: root,
        query: { appId: String(app._id) },
        body
      });
      expect(result.code).toBe(200);
      const version = await MongoAppVersion.findOne({ appId: app._id, isPublish: true }).lean();
      expect(version?.nodes?.[0].inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: NodeInputKeyEnum.datasetSearchRerankModelId,
            value: 'default-rerank'
          }),
          expect.objectContaining({
            key: NodeInputKeyEnum.datasetSearchExtensionModelId,
            value: previousDefaults.llm!.modelId
          })
        ])
      );
      expect(version?.chatConfig?.questionGuide?.modelId).toBe(previousDefaults.llm!.modelId);
      expect(version?.chatConfig?.ttsConfig?.modelId).toBe('default-tts');
    }
  );

  it('allows disabled features to retain unavailable models without replacement', async () => {
    const root = await getRootUser();
    const app = await MongoApp.create({
      name: 'disabled-models',
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    setModelTestSnapshot({ models: [] });
    const result = await Call<PublishAppBodyType, { appId: string }, undefined>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body: makeBody(false, 'deleted-id')
    });
    expect(result.code).toBe(200);
    const version = await MongoAppVersion.findOne({ appId: app._id, isPublish: true }).lean();
    expect(version?.chatConfig?.questionGuide?.modelId).toBe('deleted-id');
    expect(version?.chatConfig?.ttsConfig?.modelId).toBe('deleted-id');
  });

  it('does not publish or silently replace an explicitly unavailable model', async () => {
    const root = await getRootUser();
    const app = await MongoApp.create({
      name: 'invalid-models',
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    const result = await Call<PublishAppBodyType, { appId: string }, undefined>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body: makeBody(true, 'deleted-id')
    });
    expect(result.code).not.toBe(200);
    expect(await MongoAppVersion.countDocuments({ appId: app._id, isPublish: true })).toBe(0);
  });

  it('keeps preview and published runtime consistent when nodes carry legacy rerankModel gte-rerank-v2', async () => {
    const root = await getRootUser();
    const llm = previousDefaults.llm!;
    const gteRerank: RerankModelDataType = {
      ...llm,
      modelId: '68ad85a7463006c963799aff',
      model: 'gte-rerank-v2',
      type: ModelTypeEnum.rerank,
      config: {}
    };
    setModelTestSnapshot({ models: [llm, gteRerank] });
    setModelTestSnapshot({ defaultModels: { llm, rerank: gteRerank } });

    const dataset = await MongoDataset.create({
      name: 'test-dataset',
      teamId: root.teamId,
      tmbId: root.tmbId,
      type: DatasetTypeEnum.dataset,
      vectorModel: 'text-embedding-3-small',
      agentModel: llm.model
    });
    const app = await MongoApp.create({
      name: 'rerank-preview-vs-publish',
      type: AppTypeEnum.workflow,
      teamId: root.teamId,
      tmbId: root.tmbId
    });

    const createWorkflowNodes = () => [
      {
        nodeId: 'search-disabled-rerank',
        name: 'Search Disabled Rerank',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        outputs: [],
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            label: 'Datasets',
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
            value: [{ datasetId: String(dataset._id) }]
          },
          {
            key: NodeInputKeyEnum.datasetSearchUsingReRank,
            label: 'Rerank',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: false
          },
          {
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            label: 'Rerank model',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: 'gte-rerank-v2'
          }
        ]
      }
    ];

    const runNodeModelCheck = async ({
      nodes,
      resourceContext
    }: {
      nodes: any[];
      resourceContext: ReturnType<typeof createWorkflowResourceContext>;
    }) => {
      const runtimeNodes = storeNodes2RuntimeNodes(nodes, ['search-disabled-rerank']);
      const runtimeNodesMap = new Map(runtimeNodes.map((item) => [item.nodeId, item]));
      const variableState = await WorkflowVariableState.create({
        timezone: 'Asia/Shanghai',
        runningAppInfo: {
          sourceType: 'app' as any,
          sourceId: String(app._id),
          name: app.name,
          teamId: String(root.teamId),
          tmbId: String(root.tmbId)
        },
        uid: String(root.tmbId),
        chatId: 'chat-1',
        responseChatItemId: 'resp-1',
        histories: [],
        inputVariables: {},
        maxFileAmount: 10,
        resolveInputFile: async () => ''
      });

      await runWithContext({ mcpClientMemory: {}, resourceContext }, async () => {
        for (const node of runtimeNodes) {
          const params = getWorkflowNodeRunParams({
            node,
            runtimeNodesMap,
            variableState
          });
          if (params[NodeInputKeyEnum.datasetSearchUsingReRank]) {
            await loadWorkflowModelResource({
              appTeamId: String(root.teamId),
              userInfo: {
                teamId: String(root.teamId),
                tmbId: String(root.tmbId)
              },
              type: 'rerank',
              modelId: params[NodeInputKeyEnum.datasetSearchRerankModelId],
              model: params[NodeInputKeyEnum.datasetSearchRerankModel],
              fallbackToDefault: true
            });
          }
        }
      });
    };

    // 1. 预览链路：prepareAppWorkflowResources + 运行时节点模型校验通过
    const previewNodes = createWorkflowNodes();
    const previewResources = await prepareAppWorkflowResources({
      appId: String(app._id),
      nodes: previewNodes as any,
      teamId: String(root.teamId),
      tmbId: String(root.tmbId),
      isRoot: true
    });
    const previewContext = createWorkflowResourceContext({
      resources: previewResources,
      teamId: String(root.teamId),
      isRoot: true
    });
    await expect(
      runNodeModelCheck({ nodes: previewNodes, resourceContext: previewContext })
    ).resolves.toBeUndefined();

    // 2. 发布链路：通过 publish 接口发布，快照只保留 rerankModelId 并通过运行时节点模型校验
    const publishResult = await Call<PublishAppBodyType, { appId: string }, undefined>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body: {
        isPublish: true,
        versionName: 'v1',
        edges: [],
        nodes: createWorkflowNodes() as any
      }
    });
    expect(publishResult.code, JSON.stringify(publishResult)).toBe(200);

    const publishedVersion = await getAppLatestVersion(String(app._id), app);
    expect(publishedVersion.nodes[0].inputs).toContainEqual(
      expect.objectContaining({
        key: NodeInputKeyEnum.datasetSearchRerankModelId,
        value: gteRerank.modelId
      })
    );
    expect(
      publishedVersion.nodes[0].inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetSearchRerankModel
      )
    ).toBeUndefined();

    const publishedContext = createWorkflowResourceContext({
      resources: publishedVersion.resources,
      teamId: String(root.teamId)
    });
    await expect(
      runNodeModelCheck({
        nodes: publishedVersion.nodes,
        resourceContext: publishedContext
      })
    ).resolves.toBeUndefined();

    // 3. 存量未重新发布版本（含 4170 迁移后同时保留 rerankModelId 与旧 rerankModel 的版本）在门户直接运行不报错
    const [migratedVersion] = await MongoAppVersion.create([
      {
        appId: app._id,
        tmbId: root.tmbId,
        isPublish: true,
        versionName: 'Migrated v2',
        edges: [],
        nodes: [
          {
            nodeId: 'search-disabled-rerank',
            name: 'Search Enabled Rerank',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            outputs: [],
            inputs: [
              ...createWorkflowNodes()[0].inputs.map((input) =>
                input.key === NodeInputKeyEnum.datasetSearchUsingReRank
                  ? { ...input, value: true }
                  : input
              ),
              {
                key: NodeInputKeyEnum.datasetSearchRerankModelId,
                label: 'Rerank model ID',
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                value: gteRerank.modelId
              }
            ]
          }
        ],
        resources: [
          { type: 'dataset', id: String(dataset._id) },
          { type: 'model', id: gteRerank.modelId }
        ]
      }
    ]);
    await MongoApp.updateOne(
      { _id: app._id },
      { $set: { publishedVersionId: migratedVersion._id } }
    );

    const latestMigrated = await getAppLatestVersion(String(app._id));
    await expect(
      runNodeModelCheck({
        nodes: latestMigrated.nodes,
        resourceContext: createWorkflowResourceContext({
          resources: latestMigrated.resources,
          teamId: String(root.teamId)
        })
      })
    ).resolves.toBeUndefined();
  });
});
