import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import type { ModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import {
  createInvalidReferenceReplacer,
  replaceInvalidModelReferences
} from '@/service/core/ai/model/invalidReferences/service';

const replacement = {
  llmModelId: 'new-llm',
  sttModelId: 'new-stt',
  rerankModelId: 'new-rerank'
};
const models = [
  {
    modelId: 'new-llm',
    model: 'new-llm-name',
    type: ModelTypeEnum.llm,
    isActive: true,
    scope: ModelScopeEnum.system,
    config: { vision: true }
  },
  {
    modelId: 'old-llm',
    model: 'old-llm-name',
    type: ModelTypeEnum.llm,
    isActive: false,
    scope: ModelScopeEnum.system,
    config: { vision: true }
  },
  {
    modelId: 'new-stt',
    model: 'new-stt-name',
    type: ModelTypeEnum.stt,
    isActive: true,
    scope: ModelScopeEnum.system,
    config: {}
  },
  {
    modelId: 'new-rerank',
    model: 'new-rerank-name',
    type: ModelTypeEnum.rerank,
    isActive: true,
    scope: ModelScopeEnum.system,
    config: {}
  },
  {
    modelId: 'old-tts',
    model: 'old-tts-name',
    type: ModelTypeEnum.tts,
    isActive: false,
    scope: ModelScopeEnum.system,
    config: {}
  }
];
const handle = { getAllModels: () => models } as unknown as ModelHandle;
const ids = {
  team: new Types.ObjectId(),
  otherTeam: new Types.ObjectId(),
  member: new Types.ObjectId(),
  dataset: new Types.ObjectId(),
  otherDataset: new Types.ObjectId(),
  app: new Types.ObjectId(),
  version: new Types.ObjectId(),
  autoSaveVersion: new Types.ObjectId()
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    MongoDataset.collection.deleteMany({ _id: { $in: [ids.dataset, ids.otherDataset] } }),
    MongoApp.collection.deleteMany({ _id: ids.app }),
    MongoAppVersion.collection.deleteMany({ _id: { $in: [ids.version, ids.autoSaveVersion] } })
  ]);
});

describe('replaceInvalidModelReferences', () => {
  it('uses ID precedence, skips dynamic and plugin inputs, and resolves legacy system names by type', () => {
    const replacer = createInvalidReferenceReplacer({ handle, replacement });
    const content = replacer.replaceAppContent({
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: '{{modelId}}' }]
        },
        {
          flowNodeType: FlowNodeTypeEnum.pluginModule,
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: 'missing' }]
        },
        {
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [{ key: NodeInputKeyEnum.datasetSearchRerankModelId, value: 'old-llm' }]
        }
      ],
      chatConfig: {
        questionGuide: { open: false, model: 'old-llm-name' },
        ttsConfig: { type: 'model', modelId: 'old-tts' }
      }
    });

    expect(content.changes.llm.replacedReferences).toBe(1);
    expect(content.changes.rerank.replacedReferences).toBe(1);
    expect(content.replacedIds.has('old-llm')).toBe(true);
    expect(content.chatConfig).toMatchObject({
      questionGuide: { modelId: 'new-llm' },
      ttsConfig: { modelId: 'old-tts' }
    });
    const nodes = content.nodes as Array<{ inputs: Array<{ value: string }> }>;
    expect(nodes[0].inputs[0].value).toBe('{{modelId}}');
    expect(nodes[1].inputs[0].value).toBe('missing');
    expect(nodes[2].inputs[0].value).toBe('new-rerank');
  });

  it('replaces only invalid LLM and rerank references across one team and preserves embedding and TTS', async () => {
    await MongoDataset.collection.insertMany([
      {
        _id: ids.dataset,
        teamId: ids.team,
        tmbId: ids.member,
        name: 'dataset',
        type: 'dataset',
        deleteTime: new Date(),
        agentModelId: 'old-llm',
        vlmModelId: 'old-llm',
        vectorModelId: 'old-embedding'
      },
      {
        _id: ids.otherDataset,
        teamId: ids.otherTeam,
        tmbId: ids.member,
        name: 'other',
        type: 'dataset',
        agentModelId: 'old-llm'
      }
    ]);
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'app',
      type: 'workflow',
      deleteTime: new Date(),
      publishedVersionId: ids.version,
      modules: [
        {
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: 'old-llm' }]
        }
      ],
      chatConfig: {
        questionGuide: { open: true, modelId: 'old-llm' },
        ttsConfig: { type: 'model', modelId: 'old-tts', voice: 'voice' }
      }
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      tmbId: String(ids.member),
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSelectList,
              value: [{ datasetId: String(ids.dataset) }]
            },
            { key: NodeInputKeyEnum.datasetSearchUsingReRank, value: true },
            { key: NodeInputKeyEnum.datasetSearchRerankModelId, value: 'deleted-rerank' }
          ]
        }
      ],
      chatConfig: {
        questionGuide: { open: true, modelId: 'old-llm' },
        ttsConfig: { type: 'model', modelId: 'old-tts', voice: 'voice' }
      },
      resources: [
        { type: 'model', id: 'deleted-rerank' },
        { type: 'model', id: 'old-llm' },
        { type: 'model', id: 'old-tts' },
        { type: 'dataset', id: String(ids.dataset) }
      ]
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.autoSaveVersion,
      appId: ids.app,
      tmbId: String(ids.member),
      isAutoSave: true,
      isPublish: false,
      versionName: 'draft',
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: 'old-llm' }]
        }
      ],
      resources: [{ type: 'model', id: 'old-llm' }]
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });

    expect(result.completed).toBe(true);
    expect(result.failedSamples).toEqual([]);
    expect(result.counts.dataset.llm.replacedReferences).toBe(2);
    expect(result.counts.app.llm.replacedReferences).toBe(2);
    expect(result.counts.version.llm.replacedReferences).toBe(2);
    expect(result.counts.version.rerank.replacedReferences).toBe(1);
    expect(result.counts.version.stt.replacedReferences).toBe(0);

    const [dataset, otherDataset, app, version, autoSaveVersion] = await Promise.all([
      MongoDataset.collection.findOne({ _id: ids.dataset }),
      MongoDataset.collection.findOne({ _id: ids.otherDataset }),
      MongoApp.collection.findOne({ _id: ids.app }),
      MongoAppVersion.collection.findOne({ _id: ids.version }),
      MongoAppVersion.collection.findOne({ _id: ids.autoSaveVersion })
    ]);
    expect(dataset).toMatchObject({
      agentModelId: 'new-llm',
      vlmModelId: 'new-llm',
      vectorModelId: 'old-embedding'
    });
    expect(otherDataset?.agentModelId).toBe('old-llm');
    expect(app?.modules[0].inputs[0].value).toBe('new-llm');
    expect(String(app?.publishedVersionId)).toBe(String(ids.version));
    expect(app?.chatConfig).toMatchObject({
      questionGuide: { modelId: 'new-llm' },
      ttsConfig: { modelId: 'old-tts' }
    });
    expect(
      version?.nodes[0].inputs.some(
        (input: { key: string; value: string }) =>
          input.key === NodeInputKeyEnum.datasetSearchRerankModelId && input.value === 'new-rerank'
      )
    ).toBe(true);
    expect(version?.resources).toEqual(
      expect.arrayContaining([
        { type: 'model', id: 'new-llm' },
        { type: 'model', id: 'new-rerank' },
        { type: 'model', id: 'old-tts' },
        { type: 'dataset', id: String(ids.dataset) }
      ])
    );
    expect(version?.resources).not.toContainEqual({ type: 'model', id: 'deleted-rerank' });
    expect(version?.resources).not.toContainEqual({ type: 'model', id: 'old-llm' });
    expect(autoSaveVersion).toMatchObject({
      isAutoSave: true,
      isPublish: false,
      versionName: 'draft'
    });
    expect(autoSaveVersion?.nodes[0].inputs[0].value).toBe('new-llm');

    const second = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    expect(second.counts.dataset.llm.replacedReferences).toBe(0);
    expect(second.counts.app.llm.replacedReferences).toBe(0);
    expect(second.counts.version.llm.replacedReferences).toBe(0);
    expect(second.counts.version.rerank.replacedReferences).toBe(0);
  });

  it('rejects a non-vision target before writing any invalid image model reference', async () => {
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset',
      type: 'dataset',
      agentModelId: 'old-llm',
      vlmModelId: 'old-llm'
    });
    const textOnlyHandle = {
      getAllModels: () =>
        models.map((model) =>
          model.modelId === 'new-llm' ? { ...model, config: { vision: false } } : model
        )
    } as unknown as ModelHandle;

    await expect(
      replaceInvalidModelReferences({
        teamId: String(ids.team),
        replacement,
        handle: textOnlyHandle,
        assertCanContinue: async () => {}
      })
    ).rejects.toThrow('vision');
    const dataset = await MongoDataset.collection.findOne({ _id: ids.dataset });
    expect(dataset?.agentModelId).toBe('old-llm');
    expect(dataset?.vlmModelId).toBe('old-llm');
  });

  it('does not create absent legacy app or version fields during replacement', async () => {
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'modern app',
      type: 'workflow',
      chatConfig: { questionGuide: { open: true, modelId: 'old-llm' } }
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      tmbId: String(ids.member),
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [{ key: NodeInputKeyEnum.aiModelId, value: 'old-llm' }]
        }
      ]
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    expect(result.completed).toBe(true);
    const [app, version] = await Promise.all([
      MongoApp.collection.findOne({ _id: ids.app }),
      MongoAppVersion.collection.findOne({ _id: ids.version })
    ]);
    expect(app?.chatConfig.questionGuide.modelId).toBe('new-llm');
    expect(app).not.toHaveProperty('modules');
    expect(version?.nodes[0].inputs[0].value).toBe('new-llm');
    expect(version).not.toHaveProperty('chatConfig');
  });

  it('rereads a record and retries a conditional write after a concurrent conflict', async () => {
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset',
      type: 'dataset',
      agentModelId: 'old-llm'
    });
    vi.spyOn(MongoDataset, 'updateOne').mockResolvedValueOnce({ modifiedCount: 0 } as any);

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });

    expect(result.completed).toBe(true);
    expect(result.counts.dataset.llm.replacedReferences).toBe(1);
    expect(result.counts.dataset.llm.conflicts).toBe(0);
    expect(MongoDataset.updateOne).toHaveBeenCalledTimes(2);
  });

  it('stops further writes when owner or target validation fails mid-request', async () => {
    await MongoDataset.collection.insertMany([
      {
        _id: ids.dataset,
        teamId: ids.team,
        tmbId: ids.member,
        name: 'first',
        type: 'dataset',
        agentModelId: 'old-llm'
      },
      {
        _id: ids.otherDataset,
        teamId: ids.team,
        tmbId: ids.member,
        name: 'second',
        type: 'dataset',
        agentModelId: 'old-llm'
      }
    ]);
    let checks = 0;
    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {
        checks++;
        if (checks === 3) throw new Error('owner revoked');
      }
    });

    expect(result.completed).toBe(false);
    expect(result.stoppedReason).toBe('conditions_changed');
    expect(result.counts.dataset.llm.replacedReferences).toBe(1);
    const [first, second] = await Promise.all([
      MongoDataset.collection.findOne({ _id: ids.dataset }),
      MongoDataset.collection.findOne({ _id: ids.otherDataset })
    ]);
    expect(first?.agentModelId).toBe('new-llm');
    expect(second?.agentModelId).toBe('old-llm');
  });
});
