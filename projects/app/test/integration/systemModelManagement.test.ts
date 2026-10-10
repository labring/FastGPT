import {
  getCachedSystemModelHandle,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';

import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { type CreateModelBody } from '@fastgpt/global/openapi/core/ai/model/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const external = vi.hoisted(() => ({
  listModels: vi.fn()
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: { listModels: external.listModels }
}));
vi.mock('@fastgpt/service/core/ai/model/provider/controller', () => ({
  getModelProviderMetadata: () => ({ providers: [], aiproxyChannels: [] }),
  preloadModelProviders: vi.fn().mockResolvedValue(undefined),
  getModelProvider: (provider: string) => ({ id: provider, name: provider, avatar: '', order: 0 })
}));
vi.mock('@fastgpt/service/core/ai/model/channel/binding', () => ({
  updateModelChannelBindings: vi.fn().mockResolvedValue(undefined),
  syncModelNameInChannels: vi.fn().mockResolvedValue(undefined),
  removeModelsFromChannels: vi.fn().mockResolvedValue(undefined)
}));

import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import * as catalogEntity from '@fastgpt/service/core/ai/model/catalog/entity';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import {
  loadInstalledModels,
  refreshModelHandle
} from '@fastgpt/service/core/ai/model/catalog/service';
import { updateSystemDefaultModels } from '@fastgpt/service/core/ai/model/default/service';
import { importSystemModels } from '@fastgpt/service/core/ai/model/import';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import {
  createModel as createSystemModel,
  createModelsFromTemplates as createSystemModelsFromTemplates,
  deleteModels as deleteSystemModels,
  updateModelStatus,
  updateModel as updateSystemModel
} from '@fastgpt/service/core/ai/model/service';
import { MongoModelStatusProbeRecord } from '@fastgpt/service/core/ai/modelStatus/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

/** 通过接口真实 schema 的推导类型构造完整草稿。 */
const createDraft = (model: string): CreateModelBody['modelData'] => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: model,
  scope: ModelScopeEnum.system,
  isActive: true,
  config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
});

describe('system model management integration: MongoDB transactions and runtime catalog', () => {
  beforeEach(async () => {
    const { mongoSessionRun: actualMongoSessionRun } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    // setup 已载入无事务 mock；保留同一个 mock 函数引用，只替换为真实事务实现。
    vi.mocked(mongoSessionRun).mockImplementation(actualMongoSessionRun);
    external.listModels.mockReset().mockResolvedValue([]);
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoModelStatusProbeRecord.deleteMany({}),
      MongoAIModelCatalog.deleteMany({}),
      MongoResourcePermission.deleteMany({})
    ]);
    publishSystemModelHandle(undefined);
    await loadInstalledModels();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a model and publishes the committed catalog revision', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('integration-new')
    });

    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({
      model: 'integration-new',
      isActive: true
    });
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    expect(getCachedSystemModelHandle()?.revision).toBe(1);
    expect(getCachedSystemModelHandle()?.getAllModels()).toMatchObject([
      { modelId, model: 'integration-new' }
    ]);
  });

  it('rejects duplicate creation', async () => {
    await createSystemModel({ modelData: createDraft('duplicate') });

    await expect(createSystemModel({ modelData: createDraft('duplicate') })).rejects.toThrow(
      ModelErrEnum.alreadyExists
    );

    expect(await MongoAIModel.countDocuments({ model: 'duplicate' })).toBe(1);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
  });

  it('removes probe records and permissions when deleting models', async () => {
    external.listModels.mockResolvedValue([createDraft('template-a'), createDraft('template-b')]);
    const result = await createSystemModelsFromTemplates({
      templates: [
        { type: ModelTypeEnum.llm, model: 'template-a' },
        { type: ModelTypeEnum.llm, model: 'template-b' }
      ]
    });
    expect(result.models).toHaveLength(2);
    expect(await MongoAIModel.countDocuments({ isActive: false })).toBe(2);
    const modelIds = result.models.map(({ modelId }) => modelId);
    await MongoModelStatusProbeRecord.create(
      modelIds.map((modelId, index) => ({
        modelId,
        name: `template-${index}`,
        model: `template-${index}`,
        provider: 'OpenAI',
        type: ModelTypeEnum.llm,
        status: 'green',
        attempts: 1,
        startedAt: new Date(),
        requestStartedAt: new Date(),
        requestEndedAt: new Date()
      }))
    );
    // 原生 collection 写入只准备权限夹具；删除仍经过真实应用服务和事务。
    await MongoResourcePermission.collection.insertOne({
      resourceType: PerResourceTypeEnum.model,
      resourceId: new connectionMongo.Types.ObjectId(modelIds[0])
    });

    await deleteSystemModels({ modelIds });

    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await MongoModelStatusProbeRecord.countDocuments()).toBe(0);
    expect(await MongoResourcePermission.countDocuments()).toBe(0);
    expect(getCachedSystemModelHandle()?.getAllModels()).toEqual([]);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(2);
  });

  it('rolls back model, probe, and permission deletion when a transactional write fails', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('rollback-delete')
    });
    await MongoModelStatusProbeRecord.create({
      modelId,
      name: 'rollback-delete',
      model: 'rollback-delete',
      provider: 'OpenAI',
      type: ModelTypeEnum.llm,
      status: 'green',
      attempts: 1,
      startedAt: new Date(),
      requestStartedAt: new Date(),
      requestEndedAt: new Date()
    });
    // 在事务内模型删除之后注入下一条数据库操作失败，验证真实 MongoDB 回滚。
    vi.spyOn(MongoResourcePermission, 'deleteMany').mockImplementationOnce(() => {
      throw new Error('Injected permission delete failure');
    });

    await expect(deleteSystemModels({ modelIds: [modelId] })).rejects.toThrow(
      'Injected permission delete failure'
    );

    expect(await MongoAIModel.findById(modelId).lean()).not.toBeNull();
    expect(await MongoModelStatusProbeRecord.countDocuments({ modelId })).toBe(1);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    expect(getCachedSystemModelHandle()?.revision).toBe(1);
  });

  it('returns committed creation after reload failure and repairs the snapshot at the next read barrier', async () => {
    const failure = vi
      .spyOn(catalogEntity, 'readModelCatalogSnapshot')
      .mockRejectedValueOnce(new Error('Injected snapshot read failure'));

    const { modelId } = await createSystemModel({
      modelData: createDraft('reload-repair')
    });

    expect(await MongoAIModel.findById(modelId).lean()).not.toBeNull();
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    expect(getCachedSystemModelHandle()?.revision).toBe(0);
    failure.mockRestore();
    await refreshModelHandle();
    expect(getCachedSystemModelHandle()?.revision).toBe(1);
    expect(getCachedSystemModelHandle()?.getAllModels()).toMatchObject([
      { modelId, model: 'reload-repair' }
    ]);
  });

  it('rejects the entire template batch when one template disappears', async () => {
    external.listModels.mockResolvedValue([createDraft('available')]);
    await expect(
      createSystemModelsFromTemplates({
        templates: [
          { type: ModelTypeEnum.llm, model: 'available' },
          { type: ModelTypeEnum.llm, model: 'removed' }
        ]
      })
    ).rejects.toThrow('no longer exists');
    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(0);
  });

  it('uses the latest template parameters, skips installed names and leaves instances unchanged later', async () => {
    const installed = await createSystemModel({
      modelData: createDraft('installed')
    });
    external.listModels.mockResolvedValue([
      { ...createDraft('installed'), type: ModelTypeEnum.stt, config: {} },
      {
        ...createDraft('fresh'),
        name: 'Latest template',
        config: { maxContext: 64000, maxResponse: 8000, quoteMaxToken: 32000 }
      }
    ]);
    const result = await createSystemModelsFromTemplates({
      templates: [
        { type: ModelTypeEnum.stt, model: 'installed' },
        { type: ModelTypeEnum.llm, model: 'fresh' }
      ]
    });
    expect(result.models).toHaveLength(1);
    expect(await MongoAIModel.findById(installed.modelId).lean()).toMatchObject({
      type: 'llm',
      name: 'installed'
    });
    expect(await MongoAIModel.findById(result.models[0].modelId).lean()).toMatchObject({
      name: 'Latest template',
      isActive: false,
      config: { maxContext: 64000 }
    });
    external.listModels.mockResolvedValue([]);
    await loadInstalledModels();
    expect(getCachedSystemModelHandle()?.getAllModels()).toHaveLength(2);
    expect(external.listModels).toHaveBeenCalledTimes(1);
  });

  it('rolls back a partially matched status update without advancing revision or snapshot', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('status')
    });
    const missingId = new connectionMongo.Types.ObjectId().toString();
    await expect(
      updateModelStatus({ modelIds: [modelId, missingId], isActive: false })
    ).rejects.toBeDefined();
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({ isActive: true });
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    expect(getCachedSystemModelHandle()?.revision).toBe(1);
    await updateModelStatus({ modelIds: [modelId], isActive: false });
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({ isActive: false });
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(2);
  });

  it('preserves configured defaults when creating another model and rolls back invalid default changes', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('default')
    });
    await updateSystemDefaultModels({ llm: modelId, chatTitleLLM: modelId });
    const defaultsBefore = await MongoAIModelCatalog.find({}, { defaultModelIds: 1 }).lean();
    const second = await createSystemModel({ modelData: createDraft('second') });
    expect(second.modelId).not.toBe(modelId);
    expect(await MongoAIModelCatalog.find({}, { defaultModelIds: 1 }).lean()).toEqual(
      defaultsBefore
    );
    const revision = await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system });
    await expect(
      updateSystemDefaultModels({ llm: second.modelId, datasetImageLLM: modelId })
    ).rejects.toBeDefined();
    expect(await MongoAIModelCatalog.find({}, { defaultModelIds: 1 }).lean()).toEqual(
      defaultsBefore
    );
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(
      revision
    );
    await updateSystemDefaultModels({});
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(
      revision + 1
    );
  });

  it('prechecks immutable type and clears omitted request credentials on update', async () => {
    const { modelId } = await createSystemModel({
      modelData: {
        ...createDraft('editable'),
        requestUrl: 'http://local.test',
        requestAuth: 'test-secret'
      }
    });
    const { model: _model, ...editable } = createDraft('editable');
    await expect(
      updateSystemModel({
        modelId,
        modelData: { ...editable, type: ModelTypeEnum.stt, config: {} }
      })
    ).rejects.toThrow('type cannot be changed');
    await updateSystemModel({
      modelId,
      modelData: { ...editable, model: 'renamed-model', name: 'Renamed' }
    });
    const updated = await MongoAIModel.findById(modelId).lean();
    expect(updated).toMatchObject({ name: 'Renamed', model: 'renamed-model', type: 'llm' });
    expect(updated).not.toHaveProperty('requestUrl');
    expect(updated).not.toHaveProperty('requestAuth');
    await updateSystemModel({
      modelId,
      modelData: { ...editable, model: 'renamed-model-v2', name: 'RenamedV2' }
    });
    const updatedV2 = await MongoAIModel.findById(modelId).lean();
    expect(updatedV2).toMatchObject({
      name: 'RenamedV2',
      model: 'renamed-model-v2',
      type: 'llm'
    });
  });

  it('rejects invalid JSON records and immutable type changes, and allows deliberate empty replacement', async () => {
    const { UpdateSystemModelsWithJsonBodySchema } =
      await import('@fastgpt/global/openapi/core/ai/model/api');
    const { modelId } = await createSystemModel({ modelData: createDraft('json-original') });
    const before = await MongoAIModel.find({}).lean();
    expect(() =>
      UpdateSystemModelsWithJsonBodySchema.parse({
        config: JSON.stringify([
          { ...createDraft('invalid'), modelId: 'invalid', config: { maxContext: 'bad' } }
        ])
      })
    ).toThrow();
    expect(() =>
      UpdateSystemModelsWithJsonBodySchema.parse({
        config: JSON.stringify([createDraft('missing-id')])
      })
    ).toThrow();
    await expect(
      importSystemModels({
        config: [{ ...createDraft('type-change'), modelId, type: ModelTypeEnum.stt, config: {} }]
      })
    ).rejects.toThrow('Model type cannot be changed');
    expect(await MongoAIModel.find({}).lean()).toEqual(before);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
    await importSystemModels({
      config: [{ ...createDraft('imported-name'), modelId, name: 'Imported' }]
    });
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({
      model: 'imported-name',
      type: 'llm',
      name: 'Imported'
    });
    await MongoResourcePermission.collection.insertOne({
      resourceType: PerResourceTypeEnum.model,
      resourceId: new connectionMongo.Types.ObjectId(modelId)
    });
    await MongoModelStatusProbeRecord.create({
      modelId,
      name: 'json-original',
      model: 'json-original',
      provider: 'OpenAI',
      type: ModelTypeEnum.llm,
      status: 'green',
      attempts: 1,
      startedAt: new Date(),
      requestStartedAt: new Date(),
      requestEndedAt: new Date()
    });
    await importSystemModels({ config: [] });
    expect(await MongoAIModel.findById(modelId).lean()).toBeNull();
    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await MongoModelStatusProbeRecord.countDocuments()).toBe(0);
    expect(await MongoResourcePermission.countDocuments()).toBe(0);
  });

  it('rolls back MongoDB when model insert fails and succeeds on retry', async () => {
    const beforeDefaults = await MongoAIModelCatalog.findOne().lean();
    vi.spyOn(MongoAIModel, 'create').mockImplementationOnce(() => {
      throw new Error('Injected model insert failure');
    });
    const input = { modelData: createDraft('retry-after-db-failure') };

    await expect(createSystemModel(input)).rejects.toThrow('Injected model insert failure');

    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await MongoAIModelCatalog.findOne().lean()).toEqual(beforeDefaults);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(0);
    expect(getCachedSystemModelHandle()?.getAllModels()).toEqual([]);

    await createSystemModel(input);

    expect(await MongoAIModel.countDocuments()).toBe(1);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
  });

  it('rejects concurrent duplicate creation through the real unique index with one committed revision', async () => {
    const results = await Promise.allSettled([
      createSystemModel({ modelData: createDraft('concurrent') }),
      createSystemModel({ modelData: createDraft('concurrent') })
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await MongoAIModel.countDocuments({ model: 'concurrent' })).toBe(1);
    expect(await catalogEntity.readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(1);
  });
});
