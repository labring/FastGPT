import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/app/version/publish';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  RerankSystemModelDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { PublishAppBodyType } from '@fastgpt/global/openapi/core/app/version/api';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

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
