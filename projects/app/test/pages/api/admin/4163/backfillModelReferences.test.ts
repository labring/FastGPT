import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { Types } from '@fastgpt/service/common/mongo';
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
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getTmpData, setTmpData } from '@fastgpt/service/support/tmpData/controller';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => loggerMocks
}));

let workflowNodeIndex = 0;

const createWorkflowNode = ({
  inputs,
  nodeId = `test-node-${workflowNodeIndex++}`,
  name = 'Test node',
  outputs = [],
  ...node
}: {
  flowNodeType: FlowNodeTypeEnum;
  inputs: Array<
    { key: string; label?: string; renderTypeList?: FlowNodeInputTypeEnum[] } & Record<
      string,
      unknown
    >
  >;
  nodeId?: string;
  name?: string;
  outputs?: unknown[];
  [key: string]: unknown;
}) => ({
  ...node,
  nodeId,
  name,
  inputs: inputs.map((input) => ({
    label: input.label ?? input.key,
    renderTypeList: input.renderTypeList ?? [FlowNodeInputTypeEnum.input],
    ...input
  })),
  outputs
});

const createStoredModel = async ({
  model,
  type = ModelTypeEnum.llm,
  vision,
  isActive = true
}: {
  model: string;
  type?: ModelTypeEnum;
  vision?: boolean;
  isActive?: boolean;
}) =>
  MongoAIModel.create({
    type,
    provider: 'OpenAI',
    model,
    name: model,
    scope: 'system',
    isActive,
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
    workflowNodeIndex = 0;
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoDataset.deleteMany({}),
      MongoEvaluation.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.model }),
      MongoApp.deleteMany({}),
      MongoAppVersion.deleteMany({}),
      MongoAppTemplate.deleteMany({}),
      MongoUsageItem.deleteMany({}),
      MongoTmpData.deleteMany({})
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
    const nestedReferenceValue = [['nested-source-node', 'nested-model-output']];
    const referenceInput = {
      key: NodeInputKeyEnum.datasetDeepSearchModel,
      value: referenceValue,
      valueType: 'string'
    };
    const datasetParamsInput = {
      key: NodeInputKeyEnum.datasetParams,
      value: {
        rerankModel: 'rerank-model',
        datasetSearchExtensionModel: nestedReferenceValue
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
          createWorkflowNode({
            flowNodeType: FlowNodeTypeEnum.agent,
            inputs: [legacyInput, dynamicInput, referenceInput, datasetParamsInput]
          })
        ]
      }),
      MongoAppVersion.collection.insertOne({
        chatConfig: { ttsConfig: { model: 'tts-model' } },
        nodes: [
          createWorkflowNode({ flowNodeType: FlowNodeTypeEnum.chatNode, inputs: [legacyInput] })
        ]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: {
          nodes: [
            createWorkflowNode({ flowNodeType: FlowNodeTypeEnum.chatNode, inputs: [legacyInput] })
          ],
          chatConfig: { questionGuide: { model: 'gpt-model' } }
        }
      }),
      MongoUsageItem.collection.insertOne({ model: 'gpt-model' })
    ]);

    const preview = await runBackfillModelReferences({ dryRun: true });
    expect(preview.references.datasets.wouldUpdate).toBe(1);
    expect(preview.references.apps.wouldUpdate).toBe(1);
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
        expect.objectContaining(legacyInput),
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(gptModel._id)
        }),
        expect.objectContaining(dynamicInput),
        expect.objectContaining(referenceInput),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetDeepSearchModelId,
          value: referenceValue
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchExtensionModelId,
          value: '{{model}}'
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetParams,
          value: expect.objectContaining({
            rerankModel: 'rerank-model',
            rerankModelId: String(rerankModel._id),
            datasetSearchExtensionModel: nestedReferenceValue,
            datasetSearchExtensionModelId: nestedReferenceValue
          })
        })
      ])
    );
    const appVersion = await MongoAppVersion.collection.findOne({});
    expect(appVersion?.chatConfig.ttsConfig).toMatchObject({
      model: 'tts-model',
      modelId: String(ttsModel._id)
    });
    expect(appVersion?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining(legacyInput),
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
        expect.objectContaining(legacyInput),
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

  it('scans each app collection once while backfilling chat config and workflow together', async () => {
    const model = await createStoredModel({ model: 'single-scan-model' });
    const createLegacyNode = () =>
      createWorkflowNode({
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [{ key: NodeInputKeyEnum.aiModel, value: model.model }]
      });

    await Promise.all([
      MongoApp.collection.insertOne({
        chatConfig: { questionGuide: { model: model.model } },
        modules: [createLegacyNode()]
      }),
      MongoAppVersion.collection.insertOne({
        chatConfig: { questionGuide: { model: model.model } },
        nodes: [createLegacyNode()]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: {
          chatConfig: { questionGuide: { model: model.model } },
          nodes: [createLegacyNode()]
        }
      })
    ]);
    const appFindSpy = vi.spyOn(MongoApp, 'find');
    const appVersionFindSpy = vi.spyOn(MongoAppVersion, 'find');
    const appTemplateFindSpy = vi.spyOn(MongoAppTemplate, 'find');
    const appBulkWriteSpy = vi.spyOn(MongoApp, 'bulkWrite');
    const appVersionBulkWriteSpy = vi.spyOn(MongoAppVersion, 'bulkWrite');
    const appTemplateBulkWriteSpy = vi.spyOn(MongoAppTemplate, 'bulkWrite');

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(appFindSpy).toHaveBeenCalledTimes(1);
    expect(appVersionFindSpy).toHaveBeenCalledTimes(1);
    expect(appTemplateFindSpy).toHaveBeenCalledTimes(1);
    expect(appBulkWriteSpy).toHaveBeenCalledTimes(1);
    expect(appVersionBulkWriteSpy).toHaveBeenCalledTimes(1);
    expect(appTemplateBulkWriteSpy).toHaveBeenCalledTimes(1);
    expect(result.references.apps.scanned).toBe(1);
    expect(result.references.appVersions.scanned).toBe(1);
    expect(result.references.appTemplates.scanned).toBe(1);
    expect(result.groups.apps.scanned).toBe(3);

    const app = await MongoApp.collection.findOne({});
    expect(app?.chatConfig.questionGuide.modelId).toBe(String(model._id));
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(model._id)
        })
      ])
    );
    const appVersion = await MongoAppVersion.collection.findOne({});
    expect(appVersion?.chatConfig.questionGuide.modelId).toBe(String(model._id));
    expect(appVersion?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(model._id)
        })
      ])
    );
    const appTemplate = await MongoAppTemplate.collection.findOne({});
    expect(appTemplate?.workflow.chatConfig.questionGuide.modelId).toBe(String(model._id));
    expect(appTemplate?.workflow.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(model._id)
        })
      ])
    );
  });

  it('rejects an invalid workflow node before writing migrated inputs', async () => {
    await MongoApp.collection.insertOne({
      name: 'Invalid workflow metadata',
      modules: [
        createWorkflowNode({
          flowNodeType: FlowNodeTypeEnum.chatNode,
          avatar: 123,
          intro: 'invalid avatar should block migration',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              value: 'installed-model'
            }
          ]
        })
      ]
    });

    await expect(runBackfillModelReferences({ dryRun: false })).rejects.toThrow();

    const app = await MongoApp.collection.findOne({ name: 'Invalid workflow metadata' });
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModel,
          value: 'installed-model'
        })
      ])
    );
    expect(app?.modules[0].inputs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId
        })
      ])
    );
  });

  it('preserves an existing valid modelId even when the legacy model points elsewhere', async () => {
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
    expect(result.groups.datasets).toMatchObject({ conflicts: 0, updated: 0 });
    expect(result.references.evaluations).toMatchObject({ conflicts: 0, updated: 0 });
    expect(result.references.modelPermissions).toMatchObject({ conflicts: 0, updated: 0 });
    expect(result.references.apps).toMatchObject({ conflicts: 0, updated: 0 });
    await expect(
      MongoDataset.collection.findOne({ name: 'Conflict Dataset' })
    ).resolves.toMatchObject({
      agentModel: 'legacy-model',
      agentModelId: String(canonicalModel._id)
    });
    await expect(MongoEvaluation.collection.findOne({})).resolves.toMatchObject({
      evalModelId: String(canonicalModel._id)
    });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceType: PerResourceTypeEnum.model })
    ).resolves.toMatchObject({ resourceId: canonicalModel._id });

    const app = await MongoApp.collection.findOne({});
    expect(app?.chatConfig.questionGuide.modelId).toBe(String(canonicalModel._id));
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(canonicalModel._id)
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetParams,
          value: expect.objectContaining({
            datasetSearchExtensionModelId: String(canonicalModel._id)
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

  it('repairs invalid modelId-only business references with same-type fallbacks', async () => {
    const fallbackModel = await MongoAIModel.findOne({ model: 'installed-model' }).lean();
    await Promise.all([
      MongoDataset.collection.insertOne({
        name: 'Invalid modelId-only dataset',
        agentModelId: 'invalid-model-id'
      }),
      MongoApp.collection.insertOne({
        name: 'Invalid modelId-only chat config',
        chatConfig: { questionGuide: { modelId: 'invalid-model-id' } }
      })
    ]);

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.datasets).toMatchObject({ unresolved: 0, updated: 1 });
    expect(result.references.apps).toMatchObject({ unresolved: 0, updated: 1 });
    await expect(
      MongoDataset.collection.findOne({ name: 'Invalid modelId-only dataset' })
    ).resolves.toMatchObject({ agentModelId: String(fallbackModel?._id) });
    await expect(
      MongoApp.collection.findOne({ name: 'Invalid modelId-only chat config' })
    ).resolves.toMatchObject({
      chatConfig: { questionGuide: { modelId: String(fallbackModel?._id) } }
    });
  });

  it('deletes a model permission that cannot be mapped by resourceId or resourceName', async () => {
    await MongoResourcePermission.collection.insertOne({
      resourceType: PerResourceTypeEnum.model
    });

    const preview = await runBackfillModelReferences({ dryRun: true });
    expect(preview.references.modelPermissions).toMatchObject({
      scanned: 1,
      invalid: 1,
      wouldDelete: 1,
      deleted: 0,
      unresolved: 0
    });
    expect(
      await MongoResourcePermission.countDocuments({ resourceType: PerResourceTypeEnum.model })
    ).toBe(1);

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.modelPermissions).toMatchObject({
      scanned: 1,
      invalid: 1,
      wouldDelete: 0,
      deleted: 1,
      unresolved: 0,
      updated: 0
    });
    expect(
      await MongoResourcePermission.countDocuments({ resourceType: PerResourceTypeEnum.model })
    ).toBe(0);
  });

  it('maps model permissions to inactive system models and repairs stale resourceIds', async () => {
    const inactiveModel = await createStoredModel({
      model: 'inactive-permission-model',
      isActive: false
    });
    const staleResourceId = new Types.ObjectId();
    await MongoResourcePermission.collection.insertMany([
      {
        resourceType: PerResourceTypeEnum.model,
        resourceName: inactiveModel.model
      },
      {
        resourceType: PerResourceTypeEnum.model,
        resourceName: inactiveModel.model,
        resourceId: staleResourceId
      },
      {
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'legacy-name-snapshot',
        resourceId: inactiveModel._id
      }
    ]);

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.modelPermissions).toMatchObject({
      scanned: 3,
      unchanged: 1,
      updated: 2,
      deleted: 0,
      unresolved: 0
    });
    expect(await MongoResourcePermission.countDocuments({ resourceId: inactiveModel._id })).toBe(3);
  });

  it('does not delete a model permission repaired concurrently after scanning', async () => {
    const installedModel = await MongoAIModel.findOne({ model: 'installed-model' }).lean();
    const permission = await MongoResourcePermission.collection.insertOne({
      resourceType: PerResourceTypeEnum.model,
      resourceName: 'removed-model'
    });
    const originalBulkWrite = MongoResourcePermission.bulkWrite.bind(MongoResourcePermission);
    vi.spyOn(MongoResourcePermission, 'bulkWrite').mockImplementationOnce(
      async (operations, options) => {
        await MongoResourcePermission.collection.updateOne(
          { _id: permission.insertedId },
          {
            $set: {
              resourceName: installedModel?.model,
              resourceId: installedModel?._id
            }
          }
        );
        return originalBulkWrite(operations, options);
      }
    );

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.modelPermissions).toMatchObject({
      invalid: 1,
      deleted: 0,
      conflicts: 1
    });
    await expect(
      MongoResourcePermission.collection.findOne({ _id: permission.insertedId })
    ).resolves.toMatchObject({
      resourceName: installedModel?.model,
      resourceId: installedModel?._id
    });
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
          createWorkflowNode({
            flowNodeType: FlowNodeTypeEnum.chatNode,
            inputs: [{ key: NodeInputKeyEnum.aiModel, value: 'removed-llm' }]
          }),
          createWorkflowNode({
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            inputs: [
              {
                key: NodeInputKeyEnum.datasetSearchRerankModel,
                value: 'removed-rerank'
              }
            ]
          }),
          createWorkflowNode({
            flowNodeType: FlowNodeTypeEnum.tool,
            inputs: [
              { key: NodeInputKeyEnum.aiModel, value: 'whisper-1', label: 'model' },
              { key: NodeInputKeyEnum.aiModelId, value: 'whisper-id', label: 'model' }
            ]
          })
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
        expect.objectContaining({ key: NodeInputKeyEnum.aiModel, value: 'removed-llm' }),
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: expect.any(String)
        })
      ])
    );
    expect(version?.nodes[1].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModel,
          value: 'removed-rerank'
        })
      ])
    );
    expect(version?.nodes[2].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModel,
          value: 'whisper-1',
          label: 'model'
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: 'whisper-id',
          label: 'model'
        })
      ])
    );
  });

  it('can select an inactive system model as the migration fallback', async () => {
    const inactiveEmbedding = await createStoredModel({
      model: 'disabled-embedding',
      type: ModelTypeEnum.embedding,
      isActive: false
    });
    await MongoDataset.collection.insertOne({
      name: 'Dataset with inactive embedding fallback',
      vectorModel: 'removed-embedding'
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.datasets).toMatchObject({ unresolved: 0, updated: 1 });
    await expect(
      MongoDataset.collection.findOne({ name: 'Dataset with inactive embedding fallback' })
    ).resolves.toMatchObject({ vectorModelId: String(inactiveEmbedding._id) });
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
    }) =>
      createWorkflowNode({
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

    expect(result.references.apps).toMatchObject({
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

    expect(result.references.apps).toMatchObject({
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
        createWorkflowNode({
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
        })
      ]
    });

    const result = await runBackfillModelReferences({ dryRun: false });

    expect(result.references.apps).toMatchObject({
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

  it('replaces an invalid modelId-only workflow input with a same-type fallback', async () => {
    await MongoApp.collection.insertOne({
      name: 'invalid modelId only',
      modules: [
        createWorkflowNode({
          nodeId: 'invalid-model-id-only',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              value: 'invalid-model-id',
              valueType: 'string'
            }
          ]
        })
      ]
    });

    const result = await runBackfillModelReferences({ dryRun: false });
    const fallbackModel = await MongoAIModel.findOne({ model: 'installed-model' }).lean();

    expect(result.references.apps).toMatchObject({
      scanned: 1,
      unchanged: 0,
      unresolved: 0,
      updated: 1
    });
    const app = await MongoApp.collection.findOne({ name: 'invalid modelId only' });
    expect(app?.modules[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: String(fallbackModel?._id)
      })
    ]);
  });

  it('uses snapshot CAS to avoid overwriting a workflow saved during backfill', async () => {
    const model = await createStoredModel({ model: 'gpt-model' });
    const appInsert = await MongoApp.collection.insertOne({
      modules: [
        createWorkflowNode({
          nodeId: 'legacy-node',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [{ key: NodeInputKeyEnum.aiModel, value: 'gpt-model' }]
        })
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

    expect(result.references.apps).toMatchObject({ updated: 0, conflicts: 1 });
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
    const datasetBatchLogs = loggerMocks.debug.mock.calls.filter(
      ([message, properties]) =>
        message === '4163 model reference backfill batch completed' &&
        properties.stage === 'datasets'
    );
    expect(datasetBatchLogs).toEqual([
      [
        '4163 model reference backfill batch completed',
        expect.objectContaining({
          stage: 'datasets',
          scanned: 100,
          total: 205,
          progress: 48.78,
          batchSize: 100,
          batchUpdated: 100,
          updated: 100
        })
      ],
      [
        '4163 model reference backfill batch completed',
        expect.objectContaining({
          stage: 'datasets',
          scanned: 200,
          total: 205,
          progress: 97.56,
          batchSize: 100,
          batchUpdated: 100,
          updated: 200
        })
      ],
      [
        '4163 model reference backfill batch completed',
        expect.objectContaining({
          stage: 'datasets',
          scanned: 205,
          total: 205,
          progress: 100,
          batchSize: 5,
          batchUpdated: 5,
          updated: 205
        })
      ]
    ]);
  });

  it('logs the start and completion of every collection stage', async () => {
    await runBackfillModelReferences({ dryRun: true });

    const stageNames = [
      'modelPermissions',
      'datasets',
      'evaluations',
      'apps',
      'appVersions',
      'appTemplates'
    ];
    const startedStages = loggerMocks.info.mock.calls
      .filter(([message]) => message === '4163 model reference backfill stage started')
      .map(([, properties]) => properties.stage);
    const completedStages = loggerMocks.info.mock.calls
      .filter(([message]) => message === '4163 model reference backfill stage completed')
      .map(([, properties]) => properties.stage);

    expect(startedStages).toEqual(stageNames);
    expect(completedStages).toEqual(stageNames);
    expect(loggerMocks.info).toHaveBeenCalledWith('4163 model reference backfill started', {
      dryRun: true,
      batchSize: 100
    });
    expect(loggerMocks.info).toHaveBeenCalledWith(
      '4163 model reference backfill completed',
      expect.objectContaining({ dryRun: true, durationMs: expect.any(Number) })
    );
  });

  it('uses root-key authentication and dry-run defaults at the API boundary', async () => {
    const root = await getRootUser();
    const res = await Call(backfillModelReferencesApi, {
      auth: root,
      body: {}
    });

    expect(vi.mocked(authCert)).toHaveBeenCalledWith(expect.objectContaining({ authRoot: true }));
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

  it('clears member model caches only after a formal migration', async () => {
    const metadata = { teamId: 'team-id', tmbId: 'member-id' };
    await setTmpData({
      type: TmpDataEnum.MyModels,
      metadata,
      data: {
        ...metadata,
        modelIds: ['stale-model-id'],
        version: 'stale-version'
      }
    });

    await runBackfillModelReferences({ dryRun: true });
    await expect(getTmpData({ type: TmpDataEnum.MyModels, metadata })).resolves.toBeTruthy();

    await runBackfillModelReferences({ dryRun: false });
    await expect(getTmpData({ type: TmpDataEnum.MyModels, metadata })).resolves.toBeNull();
  });

  it('rejects execution before ai_models bootstrap has produced a model', async () => {
    await MongoAIModel.deleteMany({});

    await expect(runBackfillModelReferences({ dryRun: true })).rejects.toThrow(
      'ai_models is empty'
    );
  });
});
