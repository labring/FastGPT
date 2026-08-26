import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
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

const baseLlmModel = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'dirty-model',
  name: 'Dirty Model',
  maxContext: 16000,
  maxResponse: 8000,
  quoteMaxToken: 12000
};

describe('runBackfillModelReferences', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoSystemModel.deleteMany({}),
      MongoDataset.deleteMany({}),
      MongoEvaluation.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.model }),
      MongoApp.deleteMany({}),
      MongoAppVersion.deleteMany({}),
      MongoAppTemplate.deleteMany({}),
      MongoUsageItem.deleteMany({})
    ]);
  });

  it('backfills ID siblings without deleting legacy fields or rewriting usage history', async () => {
    const modelInsert = await MongoSystemModel.collection.insertOne({
      model: 'gpt-model',
      metadata: {
        ...baseLlmModel,
        model: 'gpt-model',
        name: 'GPT Model'
      }
    });
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
        rerankModel: 'gpt-model',
        datasetSearchExtensionModel: 'gpt-model'
      }
    };

    await Promise.all([
      MongoDataset.collection.insertOne({
        name: 'Dataset',
        vectorModel: 'gpt-model',
        agentModel: 'gpt-model'
      }),
      MongoEvaluation.collection.insertOne({ evalModel: 'gpt-model' }),
      MongoResourcePermission.collection.insertOne({
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-model'
      }),
      MongoApp.collection.insertOne({
        chatConfig: { questionGuide: { model: 'gpt-model' } },
        modules: [{ inputs: [legacyInput, dynamicInput, referenceInput, datasetParamsInput] }]
      }),
      MongoAppVersion.collection.insertOne({
        chatConfig: { ttsConfig: { model: 'gpt-model' } },
        nodes: [{ inputs: [legacyInput] }]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: {
          nodes: [{ inputs: [legacyInput] }],
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
      vectorModel: 'gpt-model',
      agentModel: 'gpt-model',
      vectorModelId: String(modelInsert.insertedId),
      agentModelId: String(modelInsert.insertedId)
    });
    await expect(MongoEvaluation.collection.findOne({})).resolves.toMatchObject({
      evalModel: 'gpt-model',
      evalModelId: String(modelInsert.insertedId)
    });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceType: PerResourceTypeEnum.model })
    ).resolves.toMatchObject({
      resourceName: 'gpt-model',
      resourceId: modelInsert.insertedId
    });

    const app = await MongoApp.collection.findOne({});
    expect(app?.chatConfig.questionGuide).toMatchObject({
      model: 'gpt-model',
      modelId: String(modelInsert.insertedId)
    });
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(modelInsert.insertedId)
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
            rerankModel: 'gpt-model',
            rerankModelId: String(modelInsert.insertedId),
            datasetSearchExtensionModel: 'gpt-model',
            datasetSearchExtensionModelId: String(modelInsert.insertedId)
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
      model: 'gpt-model',
      modelId: String(modelInsert.insertedId)
    });
    expect(appVersion?.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(modelInsert.insertedId)
        })
      ])
    );

    const appTemplate = await MongoAppTemplate.collection.findOne({});
    expect(appTemplate?.workflow.chatConfig.questionGuide).toMatchObject({
      model: 'gpt-model',
      modelId: String(modelInsert.insertedId)
    });
    expect(appTemplate?.workflow.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(modelInsert.insertedId)
        })
      ])
    );

    await expect(MongoUsageItem.collection.findOne({})).resolves.toMatchObject({
      model: 'gpt-model'
    });
    await expect(MongoUsageItem.collection.findOne({})).resolves.not.toHaveProperty('modelId');
  });

  it('reports conflicting canonical and legacy references without overwriting the ID', async () => {
    const [legacyModel, canonicalModel] = await Promise.all([
      MongoSystemModel.collection.insertOne({
        model: 'legacy-model',
        metadata: { ...baseLlmModel, model: 'legacy-model' }
      }),
      MongoSystemModel.collection.insertOne({
        model: 'canonical-model',
        metadata: { ...baseLlmModel, model: 'canonical-model' }
      })
    ]);
    await MongoDataset.collection.insertOne({
      name: 'Conflict Dataset',
      agentModel: 'legacy-model',
      agentModelId: canonicalModel.insertedId
    });

    const result = await runBackfillModelReferences({ dryRun: false });
    expect(result.groups.datasets.conflicts).toBe(1);
    await expect(
      MongoDataset.collection.findOne({ name: 'Conflict Dataset' })
    ).resolves.toMatchObject({
      agentModel: 'legacy-model',
      agentModelId: canonicalModel.insertedId
    });
    expect(String(legacyModel.insertedId)).not.toBe(String(canonicalModel.insertedId));
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

  it('uses snapshot CAS to avoid overwriting a workflow saved during backfill', async () => {
    const modelInsert = await MongoSystemModel.collection.insertOne({
      model: 'gpt-model',
      metadata: { ...baseLlmModel, model: 'gpt-model' }
    });
    const appInsert = await MongoApp.collection.insertOne({
      modules: [
        {
          nodeId: 'legacy-node',
          inputs: [{ key: NodeInputKeyEnum.aiModel, value: 'gpt-model' }]
        }
      ]
    });
    const concurrentlySavedModules = [
      {
        nodeId: 'concurrent-node',
        inputs: [{ key: NodeInputKeyEnum.aiModelId, value: String(modelInsert.insertedId) }]
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
    await MongoSystemModel.collection.insertOne({
      model: 'gpt-model',
      metadata: { ...baseLlmModel, model: 'gpt-model' }
    });
    await MongoDataset.collection.insertMany(
      Array.from({ length: 205 }, (_, index) => ({
        name: `Dataset ${index}`,
        vectorModel: 'gpt-model'
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
});
