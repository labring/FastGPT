import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { backfillAppModelReferences } from '@/migration/tasks/20260903_backfill_app_model_references';
import { backfillDatasetModelReferences } from '@/migration/tasks/20260903_backfill_dataset_model_references';
import { backfillModelPermissionReferences } from '@/migration/tasks/20260903_backfill_model_permissions';
import type { SystemMigrationContext } from '@/migration/registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheMocks = vi.hoisted(() => ({ clearAllMyModelsCache: vi.fn() }));

vi.mock('@fastgpt/service/support/permission/model/controller', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/support/permission/model/controller')
  >()),
  clearAllMyModelsCache: cacheMocks.clearAllMyModelsCache
}));

const createStoredModel = ({ model, type }: { model: string; type: ModelTypeEnum }) =>
  MongoAIModel.create({
    type,
    provider: 'OpenAI',
    model,
    name: model,
    scope: 'system',
    isActive: true,
    config:
      type === ModelTypeEnum.llm
        ? { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
        : { defaultToken: 512, maxToken: 8192, weight: 100 }
  });

const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failedRecords: SystemMigrationFailedRecord[] = [];
  const progress = new Map<string, SystemMigrationProgressInput>();
  const reportFailedRecords = vi.fn(async (records: SystemMigrationFailedRecord[]) => {
    failedRecords = structuredClone(records);
  });

  const context = {
    migrationId: '20260903_backfill_dataset_model_references',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: async () => structuredClone(failedRecords),
    reportFailedRecords,
    saveCheckpoint: async (value) => {
      checkpoint = structuredClone(value);
    },
    reportProgress: async (value) => {
      progress.set(value.key, value);
    },
    assertActive: vi.fn(async () => undefined),
    fail: async (error) => {
      if (error.failedRecords) failedRecords = structuredClone(error.failedRecords);
      throw new Error(error.message);
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } satisfies SystemMigrationContext;

  return {
    context,
    getCheckpoint: () => checkpoint,
    getFailedRecords: () => failedRecords,
    getProgress: () => progress,
    reportFailedRecords
  };
};

describe('4163 dataset model reference migration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoAIDefaultModel.deleteMany({}),
      MongoDataset.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.model }),
      MongoApp.deleteMany({}),
      MongoAppVersion.deleteMany({}),
      MongoAppTemplate.deleteMany({})
    ]);
  });

  it('migrates model permissions, deletes dangling entries, and clears only the permission cache', async () => {
    const llm = await createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm });
    await Promise.all([
      MongoResourcePermission.collection.insertOne({
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-model'
      }),
      MongoResourcePermission.collection.insertOne({
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'removed-model'
      })
    ]);

    await expect(backfillModelPermissionReferences(createContext().context)).resolves.toMatchObject(
      { processedCount: 2 }
    );
    await expect(
      MongoResourcePermission.collection.findOne({ resourceName: 'gpt-model' })
    ).resolves.toMatchObject({ resourceId: llm._id });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceName: 'removed-model' })
    ).resolves.toBeNull();
    expect(cacheMocks.clearAllMyModelsCache).toHaveBeenCalledTimes(1);
  });

  it('migrates app, app-version, and template stages with one independent model snapshot', async () => {
    const llm = await createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm });
    const legacyModelInput = {
      key: NodeInputKeyEnum.aiModel,
      label: 'Model',
      value: 'gpt-model',
      valueType: 'string',
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    const createNode = (nodeId: string) => ({
      nodeId,
      name: 'AI Chat',
      flowNodeType: FlowNodeTypeEnum.chatNode,
      inputs: [
        legacyModelInput,
        {
          ...legacyModelInput,
          key: NodeInputKeyEnum.aiModelId,
          value: 'missing-model-id'
        }
      ],
      outputs: []
    });
    const createUserGuideNode = (nodeId: string, welcomeText: string) => ({
      nodeId,
      name: 'System config',
      flowNodeType: 'userGuide',
      inputs: [
        { key: NodeInputKeyEnum.welcomeText, value: welcomeText },
        {
          key: NodeInputKeyEnum.questionGuide,
          value: { open: true, model: 'gpt-model' }
        }
      ],
      outputs: []
    });
    const createUserGuideEdge = (source: string, target: string) => ({
      source,
      target,
      sourceHandle: `${source}-source-right`,
      targetHandle: `${target}-target-left`
    });
    const [app, version, template] = await Promise.all([
      MongoApp.collection.insertOne({
        chatConfig: {
          welcomeConfig: { welcomeText: 'Current app welcome text' },
          questionGuide: { open: true, model: 'gpt-model' }
        },
        modules: [createNode('app-node'), createUserGuideNode('app-user-guide', 'Legacy app text')],
        edges: [createUserGuideEdge('app-user-guide', 'app-node')]
      }),
      MongoAppVersion.collection.insertOne({
        nodes: [
          createNode('version-node'),
          createUserGuideNode('version-user-guide', 'Legacy version text')
        ],
        edges: [createUserGuideEdge('version-user-guide', 'version-node')]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: {
          nodes: [
            createNode('template-node'),
            createUserGuideNode('template-user-guide', 'Legacy template text')
          ],
          edges: [createUserGuideEdge('template-user-guide', 'template-node')]
        }
      })
    ]);
    const state = createContext();

    await expect(backfillAppModelReferences(state.context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 1,
      appTemplatesProcessedCount: 1
    });

    const appDocument = await MongoApp.collection.findOne({ _id: app.insertedId });
    expect(appDocument?.chatConfig.questionGuide.modelId).toBe(String(llm._id));
    expect(appDocument?.chatConfig.welcomeConfig.welcomeText).toBe('Current app welcome text');
    expect(appDocument?.modules).toHaveLength(1);
    expect(appDocument?.edges).toEqual([]);
    expect(appDocument?.modules[0].inputs).toContainEqual(
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: String(llm._id) })
    );
    const versionDocument = await MongoAppVersion.collection.findOne({ _id: version.insertedId });
    expect(versionDocument?.chatConfig).toMatchObject({
      welcomeConfig: { welcomeText: 'Legacy version text' },
      questionGuide: { modelId: String(llm._id) }
    });
    expect(versionDocument?.nodes).toHaveLength(1);
    expect(versionDocument?.edges).toEqual([]);
    expect(versionDocument?.nodes[0].inputs).toContainEqual(
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: String(llm._id) })
    );
    const templateDocument = await MongoAppTemplate.collection.findOne({
      _id: template.insertedId
    });
    expect(templateDocument?.workflow.chatConfig).toMatchObject({
      welcomeConfig: { welcomeText: 'Legacy template text' },
      questionGuide: { modelId: String(llm._id) }
    });
    expect(templateDocument?.workflow.nodes).toHaveLength(1);
    expect(templateDocument?.workflow.edges).toEqual([]);
    expect(templateDocument?.workflow.nodes[0].inputs).toContainEqual(
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: String(llm._id) })
    );
    expect([...state.getProgress().values()].every((item) => item.status === 'succeeded')).toBe(
      true
    );
    expect(cacheMocks.clearAllMyModelsCache).not.toHaveBeenCalled();
  });

  it('preserves unrelated legacy workflow values while backfilling config and model IDs', async () => {
    const llm = await createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm });
    const app = await MongoApp.collection.insertOne({
      modules: [
        {
          nodeId: 'model-node',
          name: 'AI Chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModel,
              label: 'Model',
              value: 'gpt-model',
              valueType: 'string',
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'legacy-node',
          name: 'Legacy node',
          flowNodeType: 'removedLegacyNodeType',
          inputs: [],
          outputs: [{ id: 'legacy-output', type: 'removedLegacyOutputType' }]
        },
        {
          nodeId: 'legacy-user-guide',
          name: 'System config',
          flowNodeType: 'userGuide',
          inputs: [{ key: 'welcomeText', value: 'Keep this historical value' }],
          outputs: []
        }
      ]
    });
    const state = createContext();

    await expect(backfillAppModelReferences(state.context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 0,
      appTemplatesProcessedCount: 0
    });

    const document = await MongoApp.collection.findOne({ _id: app.insertedId });
    expect(document?.modules[0].inputs).toContainEqual(
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: String(llm._id) })
    );
    expect(document?.modules[1]).toMatchObject({
      flowNodeType: 'removedLegacyNodeType',
      outputs: [{ type: 'removedLegacyOutputType' }]
    });
    expect(document?.modules).toHaveLength(2);
    expect(document?.chatConfig).toMatchObject({
      welcomeConfig: { welcomeText: 'Keep this historical value' }
    });
    expect(state.getFailedRecords()).toEqual([]);
  });

  it('migrates legacy userGuide and pluginConfig nodes into chatConfig and is idempotent', async () => {
    await createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm });
    const app = await MongoApp.collection.insertOne({
      modules: [
        {
          nodeId: 'legacy-user-guide',
          name: 'System config',
          flowNodeType: 'userGuide',
          inputs: [{ key: NodeInputKeyEnum.welcomeText, value: 'Legacy welcome' }],
          outputs: []
        },
        {
          nodeId: 'legacy-plugin-config',
          name: 'Plugin config',
          flowNodeType: 'pluginConfig',
          inputs: [{ key: NodeInputKeyEnum.instruction, value: 'Legacy instruction' }],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'legacy-user-guide',
          target: 'legacy-plugin-config',
          sourceHandle: 'legacy-user-guide-source-right',
          targetHandle: 'legacy-plugin-config-target-left'
        }
      ]
    });

    await expect(backfillAppModelReferences(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 0,
      appTemplatesProcessedCount: 0
    });
    const migrated = await MongoApp.collection.findOne({ _id: app.insertedId });
    expect(migrated).toMatchObject({
      modules: [],
      edges: [],
      chatConfig: {
        welcomeConfig: { welcomeText: 'Legacy welcome' },
        instruction: 'Legacy instruction'
      }
    });

    await expect(backfillAppModelReferences(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 0,
      appTemplatesProcessedCount: 0
    });
    await expect(MongoApp.collection.findOne({ _id: app.insertedId })).resolves.toEqual(migrated);
  });

  it('preserves stored ToolSet schemas and unrelated legacy tool inputs', async () => {
    await createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm });
    const storedInputSchema = JSON.stringify({
      type: 'object',
      properties: { query: { type: 'string' } }
    });
    const app = await MongoApp.collection.insertOne({
      modules: [
        {
          nodeId: 'mcp-tool-set',
          name: 'MCP tool set',
          flowNodeType: FlowNodeTypeEnum.toolSet,
          inputs: [],
          outputs: [],
          toolConfig: {
            mcpToolSet: {
              url: 'https://example.com/mcp',
              toolList: [{ name: 'search', description: '', inputSchema: storedInputSchema }]
            }
          }
        },
        {
          nodeId: 'agent',
          name: 'Agent',
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              value: [{ id: 'tool', inputs: [{ key: 'query' }], config: {} }]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'legacy-user-guide-without-inputs',
          name: 'System config',
          flowNodeType: 'userGuide',
          outputs: []
        }
      ],
      edges: []
    });

    await expect(backfillAppModelReferences(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 0,
      appTemplatesProcessedCount: 0
    });

    const migrated = await MongoApp.collection.findOne({ _id: app.insertedId });
    expect(migrated?.modules[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toBe(
      storedInputSchema
    );
    expect(migrated?.modules[1].inputs[0].value[0].inputs).toEqual([{ key: 'query' }]);
    expect(migrated?.modules).toHaveLength(2);
  });

  it('backfills exact model IDs and leaves legacy fields intact', async () => {
    const [llm, embedding] = await Promise.all([
      createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm }),
      createStoredModel({ model: 'embedding-model', type: ModelTypeEnum.embedding })
    ]);
    const dataset = await MongoDataset.collection.insertOne({
      name: 'Dataset',
      vectorModel: 'embedding-model',
      vectorModelId: 'missing-embedding-id',
      agentModel: 'gpt-model',
      agentModelId: 'missing-llm-id'
    });
    const state = createContext();

    await expect(backfillDatasetModelReferences(state.context)).resolves.toMatchObject({
      processedCount: 1
    });

    await expect(
      MongoDataset.collection.findOne({ _id: dataset.insertedId })
    ).resolves.toMatchObject({
      vectorModel: 'embedding-model',
      agentModel: 'gpt-model',
      vectorModelId: String(embedding._id),
      agentModelId: String(llm._id)
    });
    expect(state.getFailedRecords()).toEqual([]);
    expect(state.getProgress().get('datasets')?.status).toBe('succeeded');
  });

  it('compares legacy ObjectId model snapshots as strings during CAS writes', async () => {
    const visionModel = await MongoAIModel.create({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'vision-model',
      name: 'Vision model',
      scope: 'system',
      isActive: true,
      config: {
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000,
        vision: true
      }
    });
    const staleModelId = new Types.ObjectId();
    const dataset = await MongoDataset.collection.insertOne({
      name: 'Dataset with BSON model ID',
      vlmModel: 'vision-model',
      vlmModelId: staleModelId
    });
    const state = createContext();

    await expect(backfillDatasetModelReferences(state.context)).resolves.toMatchObject({
      processedCount: 1
    });

    const document = await MongoDataset.collection.findOne({ _id: dataset.insertedId });
    expect(document?.vlmModelId).toBe(String(visionModel._id));
    expect(state.getFailedRecords()).toEqual([]);
    expect(state.getProgress().get('datasets')?.status).toBe('succeeded');
  });

  it('keeps optional or unresolvable dataset references unchanged without failing', async () => {
    await createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm });
    const dataset = await MongoDataset.collection.insertOne({
      name: 'Dataset with optional VLM',
      vectorModelId: 'missing-vector-id',
      vlmModelId: 'missing-vlm-id'
    });
    const state = createContext();

    await expect(backfillDatasetModelReferences(state.context)).resolves.toMatchObject({
      processedCount: 1
    });

    await expect(
      MongoDataset.collection.findOne({ _id: dataset.insertedId })
    ).resolves.toMatchObject({
      vectorModelId: 'missing-vector-id',
      vlmModelId: 'missing-vlm-id'
    });
    expect(state.getFailedRecords()).toEqual([]);
    expect(state.getProgress().get('datasets')?.status).toBe('succeeded');
  });

  it('uses the configured default for enabled app features and ignores disabled features', async () => {
    await createStoredModel({ model: 'first-model', type: ModelTypeEnum.llm });
    const configuredDefault = await createStoredModel({
      model: 'configured-default',
      type: ModelTypeEnum.llm
    });
    await MongoAIDefaultModel.create({
      scope: 'system',
      defaultModelIds: { llm: String(configuredDefault._id) }
    });
    const createAgentNode = ({ nodeId, enabled }: { nodeId: string; enabled: boolean }) => ({
      nodeId,
      name: 'Agent',
      flowNodeType: FlowNodeTypeEnum.agent,
      inputs: [
        {
          key: NodeInputKeyEnum.datasetParams,
          label: '',
          valueType: WorkflowIOValueTypeEnum.object,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: {
            [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: enabled,
            [NodeInputKeyEnum.datasetSearchExtensionModelId]: ''
          }
        }
      ],
      outputs: []
    });
    const [app, version, template] = await Promise.all([
      MongoApp.collection.insertOne({
        chatConfig: { questionGuide: { open: true, modelId: '' } },
        modules: [createAgentNode({ nodeId: 'app-agent', enabled: true })]
      }),
      MongoAppVersion.collection.insertOne({
        nodes: [createAgentNode({ nodeId: 'version-agent', enabled: false })]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: { nodes: [createAgentNode({ nodeId: 'template-agent', enabled: true })] }
      })
    ]);

    await expect(backfillAppModelReferences(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 1,
      appTemplatesProcessedCount: 1
    });

    const appDocument = await MongoApp.collection.findOne({ _id: app.insertedId });
    expect(appDocument?.chatConfig.questionGuide.modelId).toBe(String(configuredDefault._id));
    expect(appDocument?.modules[0].inputs[0].value.datasetSearchExtensionModelId).toBe(
      String(configuredDefault._id)
    );
    const versionDocument = await MongoAppVersion.collection.findOne({ _id: version.insertedId });
    expect(versionDocument?.nodes[0].inputs[0].value.datasetSearchExtensionModelId).toBe('');
    const templateDocument = await MongoAppTemplate.collection.findOne({
      _id: template.insertedId
    });
    expect(templateDocument?.workflow.nodes[0].inputs[0].value.datasetSearchExtensionModelId).toBe(
      String(configuredDefault._id)
    );
  });

  it('uses the first compatible model when an enabled app feature has no configured default', async () => {
    const firstModel = await createStoredModel({
      model: 'first-model',
      type: ModelTypeEnum.llm
    });
    await createStoredModel({ model: 'second-model', type: ModelTypeEnum.llm });
    const app = await MongoApp.collection.insertOne({
      chatConfig: { questionGuide: { open: true, modelId: '' } },
      modules: []
    });

    await expect(backfillAppModelReferences(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 0,
      appTemplatesProcessedCount: 0
    });

    await expect(MongoApp.collection.findOne({ _id: app.insertedId })).resolves.toMatchObject({
      chatConfig: { questionGuide: { modelId: String(firstModel._id) } }
    });
  });

  it('writes every migrated workflow field even when nodes and edges are unchanged', async () => {
    const firstModel = await createStoredModel({
      model: 'first-model',
      type: ModelTypeEnum.llm
    });
    await MongoApp.collection.insertOne({
      chatConfig: { questionGuide: { open: true, modelId: '' } },
      modules: [],
      edges: []
    });
    const updateSpy = vi.spyOn(MongoApp.collection, 'updateOne');

    await expect(backfillAppModelReferences(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1,
      appVersionsProcessedCount: 0,
      appTemplatesProcessedCount: 0
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0]?.[1]).toEqual({
      $set: {
        modules: [],
        edges: [],
        chatConfig: {
          questionGuide: { open: true, modelId: String(firstModel._id) }
        }
      }
    });
    updateSpy.mockRestore();
  });

  it('retries only failed records before continuing from the saved cursor', async () => {
    const [, embedding] = await Promise.all([
      createStoredModel({ model: 'gpt-model', type: ModelTypeEnum.llm }),
      createStoredModel({ model: 'embedding-model', type: ModelTypeEnum.embedding })
    ]);
    const failedDataset = await MongoDataset.collection.insertOne({
      name: 'Failed dataset',
      vectorModel: 'embedding-model',
      agentModel: 'gpt-model'
    });
    const successfulDataset = await MongoDataset.collection.insertOne({
      name: 'Successful dataset',
      agentModel: 'gpt-model'
    });
    const state = createContext();

    const updateSpy = vi
      .spyOn(MongoDataset, 'updateOne')
      .mockResolvedValueOnce({ matchedCount: 0 } as never);
    await expect(backfillDatasetModelReferences(state.context)).rejects.toThrow(
      '1 records still contain unresolved model references'
    );
    expect(state.getFailedRecords()).toHaveLength(1);
    expect(state.getFailedRecords()[0]?.data.recordId).toBe(String(failedDataset.insertedId));
    expect(state.getCheckpoint()).toMatchObject({ stageIndex: 1 });

    // 修改已成功且位于 checkpoint 之前的数据；重试不应回扫并覆盖这个人工值。
    await MongoDataset.collection.updateOne(
      { _id: successfulDataset.insertedId },
      { $set: { agentModelId: 'manually-adjusted-after-checkpoint' } }
    );
    updateSpy.mockRestore();
    state.reportFailedRecords.mockClear();

    await expect(backfillDatasetModelReferences(state.context)).resolves.toMatchObject({
      processedCount: 2
    });
    await expect(
      MongoDataset.collection.findOne({ _id: failedDataset.insertedId })
    ).resolves.toMatchObject({ vectorModelId: String(embedding._id) });
    await expect(
      MongoDataset.collection.findOne({ _id: successfulDataset.insertedId })
    ).resolves.toMatchObject({ agentModelId: 'manually-adjusted-after-checkpoint' });
    expect(state.getFailedRecords()).toEqual([]);
    expect(state.reportFailedRecords).toHaveBeenCalledTimes(1);
  });
});
