import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import {
  default as backfillModelReferencesApi,
  runBackfillModelReferences
} from '@/pages/api/admin/4163/backfillModelReferences';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const createStoredModel = async ({
  model,
  type = ModelTypeEnum.llm,
  vision
}: {
  model: string;
  type?: ModelTypeEnum;
  vision?: boolean;
}) =>
  MongoAIModel.create({
    type,
    provider: 'OpenAI',
    model,
    name: model,
    scope: 'system',
    config:
      type === ModelTypeEnum.llm
        ? { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000, vision }
        : type === ModelTypeEnum.embedding
          ? { defaultToken: 512, maxToken: 8192, weight: 100 }
          : type === ModelTypeEnum.tts
            ? { voices: [] }
            : {}
  });

describe('runBackfillModelReferences', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoDataset.deleteMany({}),
      MongoEvaluation.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.model }),
      MongoApp.deleteMany({}),
      MongoAppVersion.deleteMany({}),
      MongoAppTemplate.deleteMany({}),
      MongoUsageItem.deleteMany({})
    ]);
    await createStoredModel({ model: 'installed-model' });
  });

  it('backfills ID siblings without deleting legacy fields or rewriting usage history', async () => {
    const [gptModel, embeddingModel, rerankModel, ttsModel] = await Promise.all([
      createStoredModel({ model: 'gpt-model' }),
      createStoredModel({ model: 'embedding-model', type: ModelTypeEnum.embedding }),
      createStoredModel({ model: 'rerank-model', type: ModelTypeEnum.rerank }),
      createStoredModel({ model: 'tts-model', type: ModelTypeEnum.tts })
    ]);
    const legacyInput = {
      key: NodeInputKeyEnum.aiModel,
      value: 'gpt-model',
      valueType: 'string'
    };
    const dynamicInput = {
      key: NodeInputKeyEnum.datasetSearchExtensionModel,
      value: '{{model}}',
      valueType: 'string'
    };
    const referenceValue = [['source-node', 'model-output']];
    const referenceInput = {
      key: NodeInputKeyEnum.datasetDeepSearchModel,
      value: referenceValue,
      valueType: 'string'
    };
    const datasetParamsInput = {
      key: NodeInputKeyEnum.datasetParams,
      value: {
        rerankModel: 'rerank-model',
        datasetSearchExtensionModel: 'gpt-model'
      }
    };

    await Promise.all([
      MongoDataset.collection.insertOne({
        name: 'Dataset',
        vectorModel: 'embedding-model',
        agentModel: 'gpt-model'
      }),
      MongoEvaluation.collection.insertOne({ evalModel: 'gpt-model' }),
      MongoResourcePermission.collection.insertOne({
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-model'
      }),
      MongoApp.collection.insertOne({
        chatConfig: { questionGuide: { model: 'gpt-model' } },
        modules: [
          {
            flowNodeType: FlowNodeTypeEnum.agent,
            inputs: [legacyInput, dynamicInput, referenceInput, datasetParamsInput]
          }
        ]
      }),
      MongoAppVersion.collection.insertOne({
        chatConfig: { ttsConfig: { model: 'tts-model' } },
        nodes: [{ flowNodeType: FlowNodeTypeEnum.chatNode, inputs: [legacyInput] }]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: {
          nodes: [{ flowNodeType: FlowNodeTypeEnum.chatNode, inputs: [legacyInput] }],
          chatConfig: { questionGuide: { model: 'gpt-model' } }
        }
      }),
      MongoUsageItem.collection.insertOne({ model: 'gpt-model' })
    ]);

    const preview = await runBackfillModelReferences({ dryRun: true });
    expect(preview.references.datasets.wouldUpdate).toBe(1);
    expect(preview.references.appsWorkflow.wouldUpdate).toBe(1);
    await expect(MongoDataset.collection.findOne({ name: 'Dataset' })).resolves.not.toHaveProperty(
      'vectorModelId'
    );

    const result = await runBackfillModelReferences({ dryRun: false });
    expect(result.references.datasets.updated).toBe(1);
    expect(result.references.modelPermissions.updated).toBe(1);

    await expect(MongoDataset.collection.findOne({ name: 'Dataset' })).resolves.toMatchObject({
      vectorModel: 'embedding-model',
      agentModel: 'gpt-model',
      vectorModelId: String(embeddingModel._id),
      agentModelId: String(gptModel._id)
    });
    await expect(MongoEvaluation.collection.findOne({})).resolves.toMatchObject({
      evalModel: 'gpt-model',
      evalModelId: String(gptModel._id)
    });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceType: PerResourceTypeEnum.model })
    ).resolves.toMatchObject({
      resourceName: 'gpt-model',
      resourceId: gptModel._id
    });

    const app = await MongoApp.collection.findOne({});
    expect(app?.chatConfig.questionGuide).toMatchObject({
      model: 'gpt-model',
      modelId: String(gptModel._id)
    });
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(gptModel._id)
        }),
        dynamicInput,
        referenceInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetDeepSearchModelId,
          value: referenceValue
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetParams,
          value: expect.objectContaining({
            rerankModel: 'rerank-model',
            rerankModelId: String(rerankModel._id),
            datasetSearchExtensionModel: 'gpt-model',
            datasetSearchExtensionModelId: String(gptModel._id)
          })
        })
      ])
    );
    expect(app?.modules[0].inputs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.datasetSearchExtensionModelId })
      ])
    );

    const appVersion = await MongoAppVersion.collection.findOne({});
    expect(appVersion?.chatConfig.ttsConfig).toMatchObject({
      model: 'tts-model',
      modelId: String(ttsModel._id)
    });
    expect(appVersion?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(gptModel._id)
        })
      ])
    );

    const appTemplate = await MongoAppTemplate.collection.findOne({});
    expect(appTemplate?.workflow.chatConfig.questionGuide).toMatchObject({
      model: 'gpt-model',
      modelId: String(gptModel._id)
    });
    expect(appTemplate?.workflow.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(gptModel._id)
        })
      ])
    );

    await expect(MongoUsageItem.collection.findOne({})).resolves.toMatchObject({
      model: 'gpt-model'
    });
    await expect(MongoUsageItem.collection.findOne({})).resolves.not.toHaveProperty('modelId');
  });

  it('refreshes an existing model ID from the latest legacy model mapping', async () => {
    const [legacyModel, canonicalModel] = await Promise.all([
      createStoredModel({ model: 'legacy-model' }),
      createStoredModel({ model: 'canonical-model' })
    ]);
    await MongoDataset.collection.insertOne({
      name: 'Conflict Dataset',
      agentModel: 'legacy-model',
      agentModelId: String(canonicalModel._id)
    });
    await Promise.all([
      MongoEvaluation.collection.insertOne({
        evalModel: 'legacy-model',
        evalModelId: String(canonicalModel._id)
      }),
      MongoResourcePermission.collection.insertOne({
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'legacy-model',
        resourceId: canonicalModel._id
      }),
      MongoApp.collection.insertOne({
        chatConfig: {
          questionGuide: {
            model: 'legacy-model',
            modelId: String(canonicalModel._id)
          }
        },
        modules: [
          {
            flowNodeType: FlowNodeTypeEnum.agent,
            inputs: [
              {
                key: NodeInputKeyEnum.aiModel,
                value: 'legacy-model',
                valueType: 'string'
              },
              {
                key: NodeInputKeyEnum.aiModelId,
                value: String(canonicalModel._id),
                valueType: 'string'
              },
              {
                key: NodeInputKeyEnum.datasetParams,
                value: {
                  datasetSearchExtensionModel: 'legacy-model',
                  datasetSearchExtensionModelId: String(canonicalModel._id)
                }
              }
            ]
          }
        ]
      })
    ]);

    const result = await runBackfillModelReferences({ dryRun: false });
    expect(result.groups.datasets).toMatchObject({ conflicts: 0, updated: 1 });
    expect(result.references.evaluations).toMatchObject({ conflicts: 0, updated: 1 });
    expect(result.references.modelPermissions).toMatchObject({ conflicts: 0, updated: 1 });
    expect(result.references.appsChatConfig).toMatchObject({ conflicts: 0, updated: 1 });
    expect(result.references.appsWorkflow).toMatchObject({ conflicts: 0, updated: 1 });
    await expect(
      MongoDataset.collection.findOne({ name: 'Conflict Dataset' })
    ).resolves.toMatchObject({
      agentModel: 'legacy-model',
      agentModelId: String(legacyModel._id)
    });
    await expect(MongoEvaluation.collection.findOne({})).resolves.toMatchObject({
      evalModelId: String(legacyModel._id)
    });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceType: PerResourceTypeEnum.model })
    ).resolves.toMatchObject({ resourceId: legacyModel._id });

    const app = await MongoApp.collection.findOne({});
    expect(app?.chatConfig.questionGuide.modelId).toBe(String(legacyModel._id));
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(legacyModel._id)
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetParams,
          value: expect.objectContaining({
            datasetSearchExtensionModelId: String(legacyModel._id)
          })
        })
      ])
    );

    const repeatedResult = await runBackfillModelReferences({ dryRun: false });
    expect(repeatedResult.groups).toMatchObject({
      datasets: { conflicts: 0, updated: 0 },
      apps: { conflicts: 0, updated: 0 },
      evaluations: { conflicts: 0, updated: 0 },
      permissions: { conflicts: 0, updated: 0 }
    });
    expect(String(legacyModel._id)).not.toBe(String(canonicalModel._id));
  });

  it('reports unresolved references, preserves legacy values and remains idempotent', async () => {
    await MongoDataset.collection.insertOne({
      name: 'Missing Model Dataset',
      vectorModel: 'missing-model'
    });

    const preview = await runBackfillModelReferences({ dryRun: true });
    expect(preview.groups.datasets.unresolved).toBe(1);
    expect(preview.groups.datasets.wouldUpdate).toBe(0);

    const firstRun = await runBackfillModelReferences({ dryRun: false });
    const secondRun = await runBackfillModelReferences({ dryRun: false });
    expect(firstRun.groups.datasets.unresolved).toBe(1);
    expect(secondRun.groups.datasets.unresolved).toBe(1);
    await expect(
      MongoDataset.collection.findOne({ name: 'Missing Model Dataset' })
    ).resolves.toMatchObject({ vectorModel: 'missing-model' });
    await expect(
      MongoDataset.collection.findOne({ name: 'Missing Model Dataset' })
    ).resolves.not.toHaveProperty('vectorModelId');
  });

  it('reports a model permission that has neither resourceId nor a legacy resourceName', async () => {
    await MongoResourcePermission.collection.insertOne({
      resourceType: PerResourceTypeEnum.model
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.modelPermissions).toMatchObject({
      scanned: 1,
      missing: 1,
      unresolved: 1,
      updated: 0
    });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceType: PerResourceTypeEnum.model })
    ).resolves.not.toHaveProperty('resourceId');
  });

  it('falls back by model type and leaves external tool parameters untouched', async () => {
    await Promise.all([
      MongoDataset.collection.insertOne({
        name: 'Fallback Dataset',
        agentModel: 'removed-llm',
        vlmModel: 'removed-vlm'
      }),
      MongoAppVersion.collection.insertOne({
        chatConfig: { ttsConfig: { model: 'removed-tts' } },
        nodes: [
          {
            flowNodeType: FlowNodeTypeEnum.chatNode,
            inputs: [{ key: NodeInputKeyEnum.aiModel, value: 'removed-llm' }]
          },
          {
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            inputs: [
              {
                key: NodeInputKeyEnum.datasetSearchRerankModel,
                value: 'removed-rerank'
              }
            ]
          },
          {
            flowNodeType: FlowNodeTypeEnum.tool,
            inputs: [
              { key: NodeInputKeyEnum.aiModel, value: 'whisper-1', label: 'model' },
              { key: NodeInputKeyEnum.aiModelId, value: 'whisper-id', label: 'model' }
            ]
          }
        ]
      })
    ]);

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.groups).toMatchObject({
      datasets: { unresolved: 1, updated: 1 },
      apps: { unresolved: 2, updated: 1 }
    });
    await expect(
      MongoDataset.collection.findOne({ name: 'Fallback Dataset' })
    ).resolves.toMatchObject({
      agentModel: 'removed-llm',
      agentModelId: expect.any(String),
      vlmModel: 'removed-vlm'
    });
    const version = await MongoAppVersion.collection.findOne({});
    expect(version?.chatConfig.ttsConfig).toEqual({ model: 'removed-tts' });
    expect(version?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        { key: NodeInputKeyEnum.aiModel, value: 'removed-llm' },
        { key: NodeInputKeyEnum.aiModelId, value: expect.any(String) }
      ])
    );
    expect(version?.nodes[1].inputs).toEqual([
      { key: NodeInputKeyEnum.datasetSearchRerankModel, value: 'removed-rerank' }
    ]);
    expect(version?.nodes[2].inputs).toEqual([
      { key: NodeInputKeyEnum.aiModel, value: 'whisper-1', label: 'model' },
      { key: NodeInputKeyEnum.aiModelId, value: 'whisper-id', label: 'model' }
    ]);
  });

  it('backfills representative workflow model reference states', async () => {
    const [llmModel, rerankModel] = await Promise.all([
      createStoredModel({ model: 'workflow-llm' }),
      createStoredModel({ model: 'workflow-rerank', type: ModelTypeEnum.rerank })
    ]);
    const createNode = ({
      nodeId,
      flowNodeType,
      key,
      value
    }: {
      nodeId: string;
      flowNodeType: FlowNodeTypeEnum;
      key: NodeInputKeyEnum;
      value: string;
    }) => ({
      nodeId,
      flowNodeType,
      inputs: [{ key, value, valueType: 'string' }]
    });

    await MongoApp.collection.insertMany([
      {
        name: 'modelId only',
        modules: [
          createNode({
            nodeId: 'model-id-only',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            key: NodeInputKeyEnum.aiModelId,
            value: String(llmModel._id)
          })
        ]
      },
      {
        name: 'legacy llm models',
        modules: [
          createNode({
            nodeId: 'legacy-chat',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            key: NodeInputKeyEnum.aiModel,
            value: llmModel.model
          }),
          createNode({
            nodeId: 'legacy-classify',
            flowNodeType: FlowNodeTypeEnum.classifyQuestion,
            key: NodeInputKeyEnum.aiModel,
            value: llmModel.model
          }),
          createNode({
            nodeId: 'legacy-query-extension',
            flowNodeType: FlowNodeTypeEnum.queryExtension,
            key: NodeInputKeyEnum.aiModel,
            value: llmModel.model
          })
        ]
      },
      {
        name: 'legacy rerank models',
        modules: [
          createNode({
            nodeId: 'rerank-found',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            value: rerankModel.model
          }),
          createNode({
            nodeId: 'rerank-missing',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            value: 'removed-rerank-model'
          })
        ]
      }
    ]);

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.appsWorkflow).toMatchObject({
      scanned: 3,
      unchanged: 1,
      unresolved: 0,
      updated: 2
    });

    const modelIdOnlyApp = await MongoApp.collection.findOne({ name: 'modelId only' });
    expect(modelIdOnlyApp?.modules[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: String(llmModel._id)
      })
    ]);

    const legacyLlmApp = await MongoApp.collection.findOne({ name: 'legacy llm models' });
    expect(legacyLlmApp?.modules).toHaveLength(3);
    for (const workflowNode of legacyLlmApp?.modules ?? []) {
      expect(workflowNode.inputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: NodeInputKeyEnum.aiModel,
            value: llmModel.model
          }),
          expect.objectContaining({
            key: NodeInputKeyEnum.aiModelId,
            value: String(llmModel._id)
          })
        ])
      );
    }

    const legacyRerankApp = await MongoApp.collection.findOne({ name: 'legacy rerank models' });
    expect(legacyRerankApp?.modules).toHaveLength(2);
    expect(legacyRerankApp?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModel,
          value: rerankModel.model
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModelId,
          value: String(rerankModel._id)
        })
      ])
    );
    expect(legacyRerankApp?.modules[1].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModel,
          value: 'removed-rerank-model'
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModelId,
          value: String(rerankModel._id)
        })
      ])
    );
  });

  it('preserves a valid modelId when its legacy model no longer exists', async () => {
    const currentModel = await createStoredModel({ model: 'current-workflow-llm' });
    await MongoApp.collection.insertOne({
      name: 'missing legacy model with valid modelId',
      modules: [
        {
          nodeId: 'preserve-current-model-id',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              value: 'removed-workflow-llm',
              valueType: 'string'
            },
            {
              key: NodeInputKeyEnum.aiModelId,
              value: String(currentModel._id),
              valueType: 'string'
            }
          ]
        }
      ]
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.appsWorkflow).toMatchObject({
      scanned: 1,
      unchanged: 1,
      unresolved: 0,
      updated: 0
    });
    await expect(
      MongoApp.collection.findOne({ name: 'missing legacy model with valid modelId' })
    ).resolves.toMatchObject({
      modules: [
        {
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              value: 'removed-workflow-llm'
            },
            {
              key: NodeInputKeyEnum.aiModelId,
              value: String(currentModel._id)
            }
          ]
        }
      ]
    });
  });

  it('replaces a wrong-type modelId with a same-type fallback', async () => {
    const [wrongTypeModel, fallbackModel] = await Promise.all([
      createStoredModel({ model: 'wrong-type-llm' }),
      createStoredModel({ model: 'fallback-rerank', type: ModelTypeEnum.rerank })
    ]);
    await MongoApp.collection.insertOne({
      name: 'missing rerank with wrong-type modelId',
      modules: [
        {
          nodeId: 'replace-wrong-type-model-id',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [
            {
              key: NodeInputKeyEnum.datasetSearchRerankModel,
              value: 'removed-rerank',
              valueType: 'string'
            },
            {
              key: NodeInputKeyEnum.datasetSearchRerankModelId,
              value: String(wrongTypeModel._id),
              valueType: 'string'
            }
          ]
        }
      ]
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.appsWorkflow).toMatchObject({
      scanned: 1,
      unresolved: 0,
      updated: 1
    });
    const app = await MongoApp.collection.findOne({
      name: 'missing rerank with wrong-type modelId'
    });
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModel,
          value: 'removed-rerank'
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModelId,
          value: String(fallbackModel._id)
        })
      ])
    );
  });

  it('leaves an invalid modelId-only workflow input untouched', async () => {
    await MongoApp.collection.insertOne({
      name: 'invalid modelId only',
      modules: [
        {
          nodeId: 'invalid-model-id-only',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              value: 'invalid-model-id',
              valueType: 'string'
            }
          ]
        }
      ]
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.appsWorkflow).toMatchObject({
      scanned: 1,
      unchanged: 1,
      unresolved: 0,
      updated: 0
    });
    const app = await MongoApp.collection.findOne({ name: 'invalid modelId only' });
    expect(app?.modules[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: 'invalid-model-id'
      })
    ]);
  });

  it('uses snapshot CAS to avoid overwriting a workflow saved during backfill', async () => {
    const model = await createStoredModel({ model: 'gpt-model' });
    const appInsert = await MongoApp.collection.insertOne({
      modules: [
        {
          nodeId: 'legacy-node',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [{ key: NodeInputKeyEnum.aiModel, value: 'gpt-model' }]
        }
      ]
    });
    const concurrentlySavedModules = [
      {
        nodeId: 'concurrent-node',
        inputs: [{ key: NodeInputKeyEnum.aiModelId, value: String(model._id) }]
      }
    ];
    const originalBulkWrite = MongoApp.bulkWrite.bind(MongoApp);
    vi.spyOn(MongoApp, 'bulkWrite').mockImplementationOnce(async (operations, options) => {
      await MongoApp.collection.updateOne(
        { _id: appInsert.insertedId },
        { $set: { modules: concurrentlySavedModules } }
      );
      return originalBulkWrite(operations, options);
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.appsWorkflow).toMatchObject({ updated: 0, conflicts: 1 });
    await expect(MongoApp.collection.findOne({ _id: appInsert.insertedId })).resolves.toMatchObject(
      {
        modules: concurrentlySavedModules
      }
    );
  });

  it('flushes large collection updates in bounded batches', async () => {
    await createStoredModel({ model: 'gpt-model' });
    await MongoDataset.collection.insertMany(
      Array.from({ length: 205 }, (_, index) => ({
        name: `Dataset ${index}`,
        agentModel: 'gpt-model'
      }))
    );
    const bulkWriteSpy = vi.spyOn(MongoDataset, 'bulkWrite');

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.datasets.updated).toBe(205);
    expect(bulkWriteSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('uses dry-run defaults at the authenticated API boundary', async () => {
    const root = await getRootUser();
    const res = await Call(backfillModelReferencesApi, {
      auth: root,
      body: {}
    });

    expect(res).toMatchObject({
      code: 200,
      data: {
        dryRun: true,
        groups: {
          datasets: { scanned: 0, updated: 0 },
          apps: { scanned: 0, updated: 0 },
          evaluations: { scanned: 0, updated: 0 },
          permissions: { scanned: 0, updated: 0 }
        }
      }
    });
  });

  it('rejects execution before ai_models bootstrap has produced a model', async () => {
    await MongoAIModel.deleteMany({});

    await expect(runBackfillModelReferences({ dryRun: true })).rejects.toThrow(
      'ai_models is empty'
    );
  });
});
