import { MongoModelStatusProbeRecord } from '@fastgpt/service/core/ai/modelStatus/schema';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import { readModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { publishSystemModelHandle } from '@fastgpt/service/core/ai/model/cache';

const proxy = vi.hoisted(() => ({ append: vi.fn(), rename: vi.fn(), remove: vi.fn() }));
// 只替换渠道 I/O 边界，模型、版本、ACL 和补偿更新均执行真实数据库实现。
vi.mock('@fastgpt/service/core/ai/model/channel/binding', () => ({
  updateModelChannelBindings: proxy.append,
  syncModelNameInChannels: proxy.rename,
  removeModelsFromChannels: proxy.remove
}));
import {
  createModelWithLifecycle,
  createModelsFromTemplatesWithLifecycle,
  updateModelWithLifecycle,
  deleteModelsWithLifecycle,
  importSystemModelsWithLifecycle
} from '@fastgpt/service/core/ai/model/lifecycle';

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/common/mongo/sessionRun')>(
    '@fastgpt/service/common/mongo/sessionRun'
  );
  vi.mocked(mongoSessionRun).mockImplementation(actual.mongoSessionRun);
});
const owner = { channelType: 'system' as const };
const draft = {
  scope: ModelScopeEnum.system as const,
  type: ModelTypeEnum.llm as const,
  provider: 'OpenAI',
  model: 'original',
  name: 'Original',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

beforeEach(async () => {
  await Promise.all([
    MongoAIModel.deleteMany({}),
    MongoAIModelCatalog.deleteMany({}),
    MongoResourcePermission.deleteMany({}),
    MongoModelStatusProbeRecord.deleteMany({})
  ]);
  publishSystemModelHandle(undefined);
  proxy.append.mockReset().mockResolvedValue(undefined);
  proxy.rename.mockReset().mockResolvedValue(undefined);
  proxy.remove.mockReset().mockResolvedValue(undefined);
});

describe('model lifecycle', () => {
  it('preserves stable identity and synchronizes an edited upstream identifier', async () => {
    const model = await createModelWithLifecycle({ ...owner, modelData: draft, channelIds: [1] });
    await updateModelWithLifecycle({
      ...owner,
      modelId: model.modelId,
      modelData: { ...draft, model: 'renamed' }
    });
    expect((await MongoAIModel.findById(model.modelId).lean())?.model).toBe('renamed');
    expect(proxy.rename).toHaveBeenCalledWith(
      expect.objectContaining({ oldModel: 'original', newModel: 'renamed', channelType: 'system' })
    );
  });
  it('keeps a committed creation successful when the channel binding fails', async () => {
    proxy.append.mockRejectedValueOnce(new Error('proxy unavailable'));
    const created = await createModelWithLifecycle({ ...owner, modelData: draft, channelIds: [1] });
    expect(await MongoAIModel.exists({ _id: created.modelId })).toBeTruthy();
    expect(proxy.append).toHaveBeenCalledWith({
      model: draft.model,
      addChannelIds: [1],
      channelType: 'system',
      tmbId: ''
    });
  });

  it('binds already installed templates too and continues after one binding fails', async () => {
    const templates = await import('@fastgpt/service/core/ai/model/template');
    const second = { ...draft, model: 'second' };
    const templateSpy = vi
      .spyOn(templates, 'refreshModelTemplates')
      .mockResolvedValue([draft, second]);
    try {
      await createModelWithLifecycle({ ...owner, modelData: draft });
      proxy.append.mockRejectedValueOnce(new Error('first binding failed'));
      const result = await createModelsFromTemplatesWithLifecycle({
        ...owner,
        templates: [draft, second].map(({ model, type }) => ({ model, type })),
        channelIds: [1]
      });
      expect(result.models.map(({ model }) => model)).toEqual(['second']);
      expect(proxy.append.mock.calls.map(([arg]) => arg.model)).toEqual(['original', 'second']);
      expect(await MongoAIModel.countDocuments({})).toBe(2);
    } finally {
      templateSpy.mockRestore();
    }
  });

  it('compensates the Mongo identifier after failed channel synchronization', async () => {
    const model = await createModelWithLifecycle({ ...owner, modelData: draft });
    proxy.rename.mockRejectedValueOnce(new Error('proxy unavailable'));
    await expect(
      updateModelWithLifecycle({
        ...owner,
        modelId: model.modelId,
        modelData: { ...draft, model: 'renamed' }
      })
    ).rejects.toThrow('proxy unavailable');
    expect((await MongoAIModel.findById(model.modelId).lean())?.model).toBe('original');
  });
  it('imports stable IDs through the same rename and deletion cleanup used by ordinary CRUD', async () => {
    const retained = await createModelWithLifecycle({ ...owner, modelData: draft });
    const removed = await createModelWithLifecycle({
      ...owner,
      modelData: { ...draft, model: 'removed' }
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.model,
      resourceId: removed.modelId,
      teamId: new Types.ObjectId(),
      tmbId: new Types.ObjectId(),
      permission: ReadPermissionVal
    });
    await importSystemModelsWithLifecycle({
      config: [{ ...draft, modelId: retained.modelId, model: 'imported-name' }]
    });
    expect(await MongoAIModel.countDocuments({})).toBe(1);
    expect((await MongoAIModel.findById(retained.modelId).lean())?.model).toBe('imported-name');
    expect(await MongoResourcePermission.countDocuments({ resourceId: removed.modelId })).toBe(0);
    expect(proxy.rename).toHaveBeenCalledWith(
      expect.objectContaining({ oldModel: 'original', newModel: 'imported-name' })
    );
    expect(proxy.remove).toHaveBeenCalledWith({
      models: ['removed'],
      channelType: 'system',
      tmbId: ''
    });
  });
  it('compensates failed import renames, continues later renames and cleans deleted mappings', async () => {
    const first = await createModelWithLifecycle({ ...owner, modelData: draft });
    const second = await createModelWithLifecycle({
      ...owner,
      modelData: { ...draft, model: 'second' }
    });
    await createModelWithLifecycle({ ...owner, modelData: { ...draft, model: 'removed' } });
    proxy.rename.mockRejectedValueOnce(new Error('first rename failed'));
    await expect(
      importSystemModelsWithLifecycle({
        config: [
          { ...draft, modelId: first.modelId, model: 'first-renamed' },
          { ...draft, modelId: second.modelId, model: 'second-renamed' }
        ]
      })
    ).rejects.toThrow('first rename failed');
    expect((await MongoAIModel.findById(first.modelId).lean())?.model).toBe('original');
    expect((await MongoAIModel.findById(second.modelId).lean())?.model).toBe('second-renamed');
    expect(proxy.rename).toHaveBeenCalledTimes(2);
    expect(proxy.remove).toHaveBeenCalledWith({
      models: ['removed'],
      channelType: 'system',
      tmbId: ''
    });
  });
  it('cleans all teams ACL and probe history only for the deleted model', async () => {
    const removed = await createModelWithLifecycle({ ...owner, modelData: draft });
    const retained = await createModelWithLifecycle({
      ...owner,
      modelData: { ...draft, model: 'retained' }
    });
    for (const modelId of [removed.modelId, retained.modelId]) {
      for (let team = 0; team < 2; team++) {
        await MongoResourcePermission.create({
          resourceType: PerResourceTypeEnum.model,
          resourceId: modelId,
          teamId: new Types.ObjectId(),
          tmbId: new Types.ObjectId(),
          permission: ReadPermissionVal
        });
      }
      await MongoModelStatusProbeRecord.create({
        modelId,
        model: 'probe',
        name: 'Probe',
        provider: 'OpenAI',
        type: 'llm',
        status: 'green',
        attempts: 1,
        requestStartedAt: new Date(),
        requestEndedAt: new Date()
      });
    }
    await deleteModelsWithLifecycle({ ...owner, modelIds: [removed.modelId] });
    expect(await MongoResourcePermission.countDocuments({ resourceId: removed.modelId })).toBe(0);
    expect(await MongoModelStatusProbeRecord.countDocuments({ modelId: removed.modelId })).toBe(0);
    expect(await MongoResourcePermission.countDocuments({ resourceId: retained.modelId })).toBe(2);
    expect(await MongoModelStatusProbeRecord.countDocuments({ modelId: retained.modelId })).toBe(1);
    expect(await MongoAIModel.exists({ _id: retained.modelId })).toBeTruthy();
  });

  it('rolls back entity deletion and the catalog revision if cross-domain cleanup fails', async () => {
    const created = await createModelWithLifecycle({ ...owner, modelData: draft });
    const context = { scope: ModelScopeEnum.system } as const;
    const revision = await readModelCatalogRevision(context);
    const cleanup = vi
      .spyOn(resourcePermissionRepo, 'deleteByResourceIdsAcrossTeams')
      .mockRejectedValueOnce(new Error('ACL unavailable'));
    try {
      await expect(
        deleteModelsWithLifecycle({ ...owner, modelIds: [created.modelId] })
      ).rejects.toThrow('ACL unavailable');
      expect(await MongoAIModel.exists({ _id: created.modelId })).toBeTruthy();
      expect(await readModelCatalogRevision(context)).toBe(revision);
      expect(proxy.remove).not.toHaveBeenCalled();
    } finally {
      cleanup.mockRestore();
    }
  });

  it('keeps a committed deletion successful when channel cleanup fails', async () => {
    const model = await createModelWithLifecycle({ ...owner, modelData: draft });
    proxy.remove.mockRejectedValueOnce(new Error('proxy unavailable'));
    expect(await deleteModelsWithLifecycle({ ...owner, modelIds: [model.modelId] })).toEqual([
      'original'
    ]);
    expect(await MongoAIModel.countDocuments({})).toBe(0);
  });
});
