import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { createModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { legacySystemConfigNodeType } from '@fastgpt/global/core/workflow/migration/legacy/systemConfig';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import * as appResourcePermission from '@fastgpt/service/support/permission/app/resource';
import {
  createInvalidReferenceReplacer,
  replaceInvalidModelReferences
} from '@/service/core/ai/model/invalidReferences/service';

const replacement = {
  llmModelId: 'new-llm',
  ttsModelId: 'new-tts',
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
    modelId: 'active-text-llm',
    model: 'active-text-llm-name',
    type: ModelTypeEnum.llm,
    isActive: true,
    scope: ModelScopeEnum.system,
    config: { vision: false }
  },
  {
    modelId: 'new-tts',
    model: 'new-tts-name',
    type: ModelTypeEnum.tts,
    isActive: true,
    scope: ModelScopeEnum.system,
    config: {
      voices: [
        { label: 'Unavailable', value: '' },
        { label: 'First', value: 'first-voice' }
      ]
    }
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
    config: { voices: [{ label: 'Old', value: 'old-voice' }] }
  },
  {
    modelId: 'valid-tts',
    model: 'valid-tts-name',
    type: ModelTypeEnum.tts,
    isActive: true,
    scope: ModelScopeEnum.system,
    config: { voices: [{ label: 'Valid', value: 'valid-voice' }] }
  }
];
const createHandle = (modelList = models) =>
  createModelHandle({
    models: modelList as unknown as Parameters<typeof createModelHandle>[0]['models'],
    configuredDefaultModelIds: {},
    revision: 1,
    version: 'test'
  });
const handle = createHandle();
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
        ttsConfig: { type: 'model', modelId: 'old-tts', voice: 'old-voice' }
      }
    });

    expect(content.changes.llm.replacedReferences).toBe(1);
    expect(content.changes.tts.replacedReferences).toBe(1);
    expect(content.changes.rerank.replacedReferences).toBe(1);
    expect(content.chatConfig).toMatchObject({
      questionGuide: { modelId: 'new-llm', model: 'new-llm-name' },
      ttsConfig: { modelId: 'new-tts', voice: 'first-voice' }
    });
    expect(content.chatConfig?.ttsConfig).not.toHaveProperty('model');
    const nodes = content.nodes as Array<{ inputs: Array<{ value: string }> }>;
    expect(nodes[0].inputs[0].value).toBe('{{modelId}}');
    expect(nodes[1].inputs[0].value).toBe('missing');
    expect(nodes[2].inputs[0].value).toBe('new-rerank');
  });

  it('persists team model IDs for legacy config and node references', () => {
    const systemModel = {
      modelId: 'system-shared-llm',
      model: 'shared-llm-name',
      type: ModelTypeEnum.llm,
      isActive: true,
      scope: ModelScopeEnum.system,
      config: { vision: true }
    };
    const teamModel = {
      modelId: 'team-llm',
      model: 'shared-llm-name',
      type: ModelTypeEnum.llm,
      isActive: true,
      scope: ModelScopeEnum.team,
      teamId: String(ids.team),
      config: { vision: true }
    };
    const teamHandle = createHandle([...models, systemModel, teamModel]);
    const replacer = createInvalidReferenceReplacer({
      handle: teamHandle,
      replacement: { ...replacement, llmModelId: teamModel.modelId }
    });
    const content = replacer.replaceAppContent({
      nodes: [
        {
          nodeId: 'legacy-chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              label: 'Model',
              value: 'old-llm-name',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
              selectedTypeIndex: 0,
              customMetadata: 'preserve'
            }
          ]
        }
      ],
      chatConfig: {
        questionGuide: {
          open: true,
          model: 'old-llm-name',
          customMetadata: 'preserve'
        }
      }
    });
    const node = (content.nodes as Array<{ inputs: Array<Record<string, unknown>> }>)[0];

    expect(
      teamHandle.getModelData({ model: teamModel.model }, { type: ModelTypeEnum.llm }).modelId
    ).toBe(systemModel.modelId);
    expect(
      teamHandle.getModelData({ modelId: content.chatConfig?.questionGuide?.modelId }).modelId
    ).toBe(teamModel.modelId);
    expect(content.changes.llm.replacedReferences).toBe(2);
    expect(content.chatConfig?.questionGuide).toMatchObject({
      modelId: teamModel.modelId,
      model: teamModel.model,
      customMetadata: 'preserve'
    });
    expect(node.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModel,
          value: teamModel.model,
          selectedTypeIndex: 0,
          customMetadata: 'preserve'
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: teamModel.modelId,
          selectedTypeIndex: 0,
          customMetadata: 'preserve'
        })
      ])
    );
  });

  it('replaces invalid LLM, TTS and rerank references across one team and preserves embedding', async () => {
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
          nodeId: 'app-chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value: 'old-llm',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
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
          nodeId: 'version-search',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          name: 'Dataset search',
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSelectList,
              label: 'Datasets',
              value: [{ datasetId: String(ids.dataset) }]
            },
            { key: NodeInputKeyEnum.datasetSearchUsingReRank, label: 'Rerank', value: true },
            {
              key: NodeInputKeyEnum.datasetSearchRerankModelId,
              label: 'Rerank model',
              value: 'deleted-rerank',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
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
          nodeId: 'autosave-chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value: 'old-llm',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
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
    expect(result.counts.dataset.tts.replacedReferences).toBe(0);
    expect(result.counts.app.tts.replacedReferences).toBe(1);
    expect(result.counts.version.tts.replacedReferences).toBe(1);

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
      ttsConfig: { modelId: 'new-tts', voice: 'first-voice' }
    });
    expect(app?.chatConfig.ttsConfig).not.toHaveProperty('model');
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
        { type: 'model', id: 'new-tts' },
        { type: 'dataset', id: String(ids.dataset) }
      ])
    );
    expect(version?.resources).toEqual(
      expect.arrayContaining([
        { type: 'model', id: 'deleted-rerank' },
        { type: 'model', id: 'old-llm' },
        { type: 'model', id: 'old-tts' }
      ])
    );
    expect(version?.chatConfig.ttsConfig).toMatchObject({
      modelId: 'new-tts',
      voice: 'first-voice'
    });
    expect(version?.chatConfig.ttsConfig).not.toHaveProperty('model');
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
    expect(second.counts.app.tts.replacedReferences).toBe(0);
    expect(second.counts.version.tts.replacedReferences).toBe(0);
  });

  it('uses migrated input modes for detection and writes only original model fields', async () => {
    const node = {
      nodeId: 'chat-node',
      flowNodeType: FlowNodeTypeEnum.chatNode,
      name: 'Chat',
      inputs: [
        {
          key: NodeInputKeyEnum.aiModelId,
          label: 'Model',
          value: 'old-llm',
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.selectLLMModel],
          selectedTypeIndex: 1,
          sourceMetadata: 'preserve'
        }
      ],
      outputs: []
    };
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'legacy app',
      type: 'workflow',
      modules: [node]
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      nodes: [node],
      edges: []
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const [app, version] = await Promise.all([
      MongoApp.collection.findOne({ _id: ids.app }),
      MongoAppVersion.collection.findOne({ _id: ids.version })
    ]);

    expect(result.counts.app.llm.replacedReferences).toBe(1);
    expect(result.counts.version.llm.replacedReferences).toBe(1);
    for (const input of [app?.modules[0].inputs[0], version?.nodes[0].inputs[0]]) {
      expect(input).toMatchObject({
        key: NodeInputKeyEnum.aiModelId,
        value: 'new-llm',
        selectedTypeIndex: 1,
        sourceMetadata: 'preserve'
      });
      expect(input).not.toHaveProperty('selectedType');
    }
    expect(app?.modules[0].inputs).toHaveLength(1);
    expect(version?.nodes[0].inputs).toHaveLength(1);
  });

  it('leaves a missing version snapshot for normal read-time resource resolution', async () => {
    const privateModel = {
      modelId: 'private-llm',
      model: 'private-llm-name',
      type: ModelTypeEnum.llm,
      isActive: true,
      scope: ModelScopeEnum.team,
      teamId: String(ids.otherTeam),
      config: { vision: false }
    };
    const ownerLimitedHandle = createHandle([...models, privateModel]);
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'legacy app',
      type: 'workflow',
      modules: []
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      nodes: [
        {
          nodeId: 'dataset-search',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          name: 'Dataset search',
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSelectList,
              label: 'Datasets',
              value: [{ datasetId: String(ids.dataset) }],
              renderTypeList: [
                FlowNodeInputTypeEnum.reference,
                FlowNodeInputTypeEnum.selectDataset
              ],
              selectedTypeIndex: 1
            }
          ],
          outputs: []
        },
        {
          nodeId: 'old-model',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Old model',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value: 'old-llm',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'private-model',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Private model',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value: 'private-llm',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
        }
      ],
      edges: []
    });
    const filterSpy = vi
      .spyOn(appResourcePermission, 'filterAuthorizedAppResources')
      .mockImplementation(async ({ resources }) =>
        resources.filter((resource) => !['old-llm', 'private-llm'].includes(resource.id))
      );

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle: ownerLimitedHandle,
      assertCanContinue: async () => {}
    });
    const version = await MongoAppVersion.collection.findOne({ _id: ids.version });

    expect(result.counts.version.llm.replacedReferences).toBe(1);
    expect(filterSpy).not.toHaveBeenCalled();
    expect(version).not.toHaveProperty('resources');
    expect(version?.nodes[1].inputs[0].value).toBe('new-llm');
    expect(version?.nodes[2].inputs[0].value).toBe('private-llm');
  });

  it('only changes model-based playback and keeps valid TTS settings', () => {
    const replacer = createInvalidReferenceReplacer({ handle, replacement });
    const disabled = replacer.replaceAppContent({
      chatConfig: { ttsConfig: { type: 'none', modelId: 'old-tts', voice: 'old-voice' } }
    });
    const browser = replacer.replaceAppContent({
      chatConfig: { ttsConfig: { type: 'web', modelId: 'old-tts', voice: 'old-voice' } }
    });
    const valid = replacer.replaceAppContent({
      chatConfig: { ttsConfig: { type: 'model', modelId: 'new-tts', voice: 'chosen-voice' } }
    });
    const legacy = replacer.replaceAppContent({
      chatConfig: { ttsConfig: { type: 'model', model: 'old-tts-name', voice: 'old-voice' } }
    });

    expect(disabled.chatConfig).toMatchObject({ ttsConfig: { modelId: 'old-tts' } });
    expect(browser.chatConfig).toMatchObject({ ttsConfig: { modelId: 'old-tts' } });
    expect(valid.chatConfig).toMatchObject({
      ttsConfig: { modelId: 'new-tts', voice: 'chosen-voice' }
    });
    expect(legacy.chatConfig).toMatchObject({
      ttsConfig: { modelId: 'new-tts', model: 'new-tts-name', voice: 'first-voice' }
    });
    expect(disabled.changes.tts.replacedReferences).toBe(0);
    expect(browser.changes.tts.replacedReferences).toBe(0);
    expect(valid.changes.tts.replacedReferences).toBe(0);
    expect(legacy.changes.tts.replacedReferences).toBe(1);
  });

  it('leaves missing legacy version resources for normal read-time resolution', async () => {
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'legacy app',
      type: 'workflow',
      modules: []
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      tmbId: String(ids.member),
      nodes: [
        {
          nodeId: 'legacy-system-config',
          flowNodeType: legacySystemConfigNodeType,
          name: 'Legacy config',
          inputs: [
            {
              key: NodeInputKeyEnum.tts,
              label: 'TTS',
              value: {
                type: 'model',
                modelId: 'valid-tts',
                model: 'valid-tts-name',
                voice: 'valid-voice'
              }
            }
          ],
          outputs: []
        },
        {
          nodeId: 'chat-node',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value: 'old-llm',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
        }
      ],
      resourceRefs: { skillIds: ['legacy-skill'] }
    });
    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const version = await MongoAppVersion.collection.findOne({ _id: ids.version });

    expect(result.counts.version.llm.replacedReferences).toBe(1);
    expect(version).not.toHaveProperty('resources');
    expect(version?.resourceRefs).toEqual({ skillIds: ['legacy-skill'] });
    expect(version?.nodes[0].flowNodeType).toBe(legacySystemConfigNodeType);
    expect(version?.nodes[0].inputs[0].value).toMatchObject({
      modelId: 'valid-tts',
      voice: 'valid-voice'
    });
    expect(version?.nodes[1].inputs[0].value).toBe('new-llm');
  });

  it('replaces legacy userGuide model inputs in app modules and version nodes in place', async () => {
    const preservedResource = {
      type: 'dataset' as const,
      id: 'legacy-dataset',
      legacyMetadata: 'preserve'
    };
    const legacyNode = {
      nodeId: 'legacy-system-config',
      flowNodeType: legacySystemConfigNodeType,
      name: 'Legacy config',
      inputs: [
        {
          key: NodeInputKeyEnum.questionGuide,
          label: 'Question guide',
          value: { open: true, modelId: 'old-llm', model: 'old-llm-name' }
        },
        {
          key: NodeInputKeyEnum.tts,
          label: 'TTS',
          value: { type: 'model', modelId: 'old-tts', model: 'old-tts-name', voice: 'old-voice' }
        }
      ],
      outputs: []
    };
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'legacy app',
      type: 'workflow',
      modules: [legacyNode]
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      tmbId: String(ids.member),
      nodes: [legacyNode],
      resources: [
        preservedResource,
        { type: 'model', id: 'old-llm' },
        { type: 'model', id: 'old-tts' }
      ]
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const [app, version] = await Promise.all([
      MongoApp.collection.findOne({ _id: ids.app }),
      MongoAppVersion.collection.findOne({ _id: ids.version })
    ]);
    const updatedInputs = [app?.modules[0].inputs, version?.nodes[0].inputs];

    expect(result.counts.app.llm.replacedReferences).toBe(1);
    expect(result.counts.app.tts.replacedReferences).toBe(1);
    expect(result.counts.version.llm.replacedReferences).toBe(1);
    expect(result.counts.version.tts.replacedReferences).toBe(1);
    updatedInputs.forEach((inputs) => {
      expect(inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: NodeInputKeyEnum.questionGuide,
            value: { open: true, modelId: 'new-llm', model: 'new-llm-name' }
          }),
          expect.objectContaining({
            key: NodeInputKeyEnum.tts,
            value: {
              type: 'model',
              modelId: 'new-tts',
              model: 'new-tts-name',
              voice: 'first-voice'
            }
          })
        ])
      );
    });
    expect(app?.modules[0].flowNodeType).toBe(legacySystemConfigNodeType);
    expect(app?.chatConfig).toBeUndefined();
    expect(version?.nodes[0].flowNodeType).toBe(legacySystemConfigNodeType);
    expect(version?.chatConfig).toBeUndefined();
    expect(version?.resources).toEqual(
      expect.arrayContaining([
        { type: 'model', id: 'new-llm' },
        { type: 'model', id: 'new-tts' }
      ])
    );
    expect(version?.resources).toContainEqual({ type: 'model', id: 'old-llm' });
    expect(version?.resources).toContainEqual({ type: 'model', id: 'old-tts' });
    expect(version?.resources).toContainEqual(preservedResource);
  });

  it('writes a TTS-only change and updates the version model resource', async () => {
    await MongoApp.collection.insertOne({
      _id: ids.app,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'speech app',
      type: 'workflow',
      chatConfig: { ttsConfig: { type: 'model', modelId: 'old-tts', voice: 'old-voice' } }
    });
    await MongoAppVersion.collection.insertOne({
      _id: ids.version,
      appId: ids.app,
      tmbId: String(ids.member),
      nodes: [],
      chatConfig: { ttsConfig: { type: 'model', modelId: 'old-tts', voice: 'old-voice' } },
      resources: [{ type: 'model', id: 'old-tts' }]
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const [app, version] = await Promise.all([
      MongoApp.collection.findOne({ _id: ids.app }),
      MongoAppVersion.collection.findOne({ _id: ids.version })
    ]);

    expect(result.counts.app.tts.replacedReferences).toBe(1);
    expect(result.counts.version.tts.replacedReferences).toBe(1);
    expect(app?.chatConfig.ttsConfig).toMatchObject({ modelId: 'new-tts', voice: 'first-voice' });
    expect(version?.chatConfig.ttsConfig).toMatchObject({
      modelId: 'new-tts',
      voice: 'first-voice'
    });
    expect(version?.resources).toEqual([
      { type: 'model', id: 'old-tts' },
      { type: 'model', id: 'new-tts' }
    ]);
  });

  it('rejects a TTS target without a usable voice before writing', async () => {
    const noVoiceHandle = createHandle(
      models.map((model) =>
        model.modelId === 'new-tts'
          ? { ...model, config: { voices: [{ label: 'Empty', value: '' }] } }
          : model
      )
    );
    await expect(
      replaceInvalidModelReferences({
        teamId: String(ids.team),
        replacement,
        handle: noVoiceHandle,
        assertCanContinue: async () => {}
      })
    ).rejects.toThrow('available voice');
  });

  it('replaces legacy dataset text and image model names without changing the index model', async () => {
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'legacy dataset',
      type: 'dataset',
      agentModel: 'deleted-text-model',
      vlmModel: 'deleted-image-model',
      vectorModel: 'old-index-model'
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const dataset = await MongoDataset.collection.findOne({ _id: ids.dataset });

    expect(result.failedSamples).toEqual([]);
    expect(result.counts.dataset.llm.replacedReferences).toBe(2);
    expect(dataset).toMatchObject({
      agentModelId: 'new-llm',
      agentModel: 'new-llm-name',
      vlmModelId: 'new-llm',
      vlmModel: 'new-llm-name',
      vectorModel: 'old-index-model'
    });
  });

  it('replaces BSON model IDs in old datasets and leaves the index model untouched', async () => {
    const oldAgentId = new Types.ObjectId();
    const oldVlmId = new Types.ObjectId();
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset with BSON model IDs',
      type: 'dataset',
      agentModelId: oldAgentId,
      agentModel: 'old-agent',
      vlmModelId: oldVlmId,
      vlmModel: 'old-vlm',
      vectorModelId: new Types.ObjectId()
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const dataset = await MongoDataset.collection.findOne({ _id: ids.dataset });

    expect(result.counts.dataset.llm.replacedReferences).toBe(2);
    expect(dataset?.agentModelId).toBe('new-llm');
    expect(dataset?.vlmModelId).toBe('new-llm');
    expect(dataset?.vectorModelId).toBeInstanceOf(Types.ObjectId);
  });

  it('replaces BSON legacy dataset model fields without adding an ID to the index model', async () => {
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset with BSON legacy fields',
      type: 'dataset',
      agentModel: new Types.ObjectId(),
      vlmModel: new Types.ObjectId(),
      vectorModel: 'old-index-model'
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const dataset = await MongoDataset.collection.findOne({ _id: ids.dataset });

    expect(result.counts.dataset.llm.replacedReferences).toBe(2);
    expect(dataset).toMatchObject({
      agentModelId: 'new-llm',
      agentModel: 'new-llm-name',
      vlmModelId: 'new-llm',
      vlmModel: 'new-llm-name',
      vectorModel: 'old-index-model'
    });
    expect(dataset).not.toHaveProperty('vectorModelId');
  });

  it('rejects a non-vision target before writing any invalid image model reference', async () => {
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset',
      type: 'dataset',
      agentModelId: 'old-llm',
      vlmModelId: 'active-text-llm'
    });
    const textOnlyHandle = createHandle(
      models.map((model) =>
        model.modelId === 'new-llm' ? { ...model, config: { vision: false } } : model
      )
    );

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
    expect(dataset?.vlmModelId).toBe('active-text-llm');
  });

  it('replaces an active text-only model in the dataset image slot', async () => {
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset with text-only image model',
      type: 'dataset',
      vlmModelId: 'active-text-llm',
      vlmModel: 'active-text-llm-name'
    });

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });
    const dataset = await MongoDataset.collection.findOne({ _id: ids.dataset });

    expect(result.counts.dataset.llm.replacedReferences).toBe(1);
    expect(dataset).toMatchObject({ vlmModelId: 'new-llm', vlmModel: 'new-llm-name' });
  });

  it('rejects a non-vision target for a BSON image model ID before writing', async () => {
    const oldVlmId = new Types.ObjectId();
    await MongoDataset.collection.insertOne({
      _id: ids.dataset,
      teamId: ids.team,
      tmbId: ids.member,
      name: 'dataset',
      type: 'dataset',
      agentModelId: 'old-llm',
      vlmModelId: oldVlmId
    });
    const textOnlyHandle = createHandle(
      models.map((model) =>
        model.modelId === 'new-llm' ? { ...model, config: { vision: false } } : model
      )
    );

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
    expect(dataset?.vlmModelId).toEqual(oldVlmId);
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
          nodeId: 'chat-node',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value: 'old-llm',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
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
    expect(version?.nodes[0].inputs[0]).not.toHaveProperty('selectedType');
    expect(version?.nodes[0].inputs[0]).not.toHaveProperty('model');
    expect(version?.nodes[0].inputs).toHaveLength(1);
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
    vi.spyOn(MongoDataset.collection, 'updateOne').mockResolvedValueOnce({
      modifiedCount: 0
    } as any);

    const result = await replaceInvalidModelReferences({
      teamId: String(ids.team),
      replacement,
      handle,
      assertCanContinue: async () => {}
    });

    expect(result.completed).toBe(true);
    expect(result.counts.dataset.llm.replacedReferences).toBe(1);
    expect(result.counts.dataset.llm.conflicts).toBe(0);
    expect(MongoDataset.collection.updateOne).toHaveBeenCalledTimes(2);
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
