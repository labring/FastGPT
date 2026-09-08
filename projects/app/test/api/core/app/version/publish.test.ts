import handler from '@/pages/api/core/app/version/publish';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  RerankSystemModelDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { PublishAppBodyType } from '@fastgpt/global/openapi/core/app/version/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getRootUser, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('publish optional model defaults', () => {
  let previousModels: typeof global.systemActiveModelList;
  let previousDefaults: typeof global.systemDefaultModel;
  beforeEach(() => {
    previousModels = global.systemActiveModelList;
    previousDefaults = global.systemDefaultModel;
    const llm = previousDefaults.llm!;
    const rerank: RerankSystemModelDataType = {
      ...llm,
      modelId: 'default-rerank',
      model: 'rerank',
      type: ModelTypeEnum.rerank,
      config: {}
    };
    const tts: TTSSystemModelDataType = {
      ...llm,
      modelId: 'default-tts',
      model: 'tts',
      type: ModelTypeEnum.tts,
      config: { voices: [{ label: 'Voice', value: 'voice' }] }
    };
    global.systemActiveModelList = [llm, rerank, tts];
    global.systemDefaultModel = { llm, rerank, tts };
  });
  afterEach(() => {
    global.systemActiveModelList = previousModels;
    global.systemDefaultModel = previousDefaults;
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
    global.systemActiveModelList = [restrictedModel, availableModel];
    global.systemDefaultModel = { llm: restrictedModel };
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
    expect((await MongoApp.findById(app._id).lean())?.chatConfig?.questionGuide).toBeUndefined();
  });

  it('fills an empty enabled model only from the publishing member available candidates', async () => {
    const { member, app, availableModel } = await createRestrictedModelScenario();
    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: { isPublish: true, nodes: [], chatConfig: { questionGuide: { open: true } } }
    });
    expect(result.code).toBe(200);
    const saved = await MongoApp.findById(app._id).lean();
    const version = await MongoAppVersion.findOne({ appId: app._id, isPublish: true }).lean();
    expect(saved?.chatConfig?.questionGuide?.modelId).toBe(availableModel.modelId);
    expect(version?.chatConfig?.questionGuide?.modelId).toBe(availableModel.modelId);
  });

  it('rejects publishing when no permitted fallback exists', async () => {
    const { member, app, restrictedModel } = await createRestrictedModelScenario();
    global.systemActiveModelList = [restrictedModel];
    const result = await Call(handler, {
      auth: member,
      query: { appId: String(app._id) },
      body: { isPublish: true, nodes: [], chatConfig: { questionGuide: { open: true } } }
    });
    expect(result.code).not.toBe(200);
    expect(await MongoAppVersion.countDocuments({ appId: app._id })).toBe(0);
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
    expect((await MongoApp.findById(app._id).lean())?.chatConfig?.questionGuide?.modelId).toBe(
      restrictedModel.modelId
    );
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
      const saved = await MongoApp.findById(app._id).lean();
      const version = await MongoAppVersion.findOne({ appId: app._id, isPublish: true }).lean();
      for (const nodes of [saved?.modules, version?.nodes]) {
        expect(nodes?.[0].inputs).toEqual(
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
      }
      for (const config of [saved?.chatConfig, version?.chatConfig]) {
        expect(config?.questionGuide?.modelId).toBe(previousDefaults.llm!.modelId);
        expect(config?.ttsConfig?.modelId).toBe('default-tts');
      }
    }
  );

  it('allows disabled features to retain unavailable models without replacement', async () => {
    const root = await getRootUser();
    const app = await MongoApp.create({
      name: 'disabled-models',
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    global.systemActiveModelList = [];
    const result = await Call<PublishAppBodyType, { appId: string }, undefined>(handler, {
      auth: root,
      query: { appId: String(app._id) },
      body: makeBody(false, 'deleted-id')
    });
    expect(result.code).toBe(200);
    const saved = await MongoApp.findById(app._id).lean();
    expect(saved?.chatConfig?.questionGuide?.modelId).toBe('deleted-id');
    expect(saved?.chatConfig?.ttsConfig?.modelId).toBe('deleted-id');
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
});
