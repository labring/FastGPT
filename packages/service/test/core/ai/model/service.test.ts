import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { sortModelOrderItems } from '@fastgpt/global/core/ai/model/order';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  clearTeamModelCatalogCache,
  getCachedSystemModelHandle,
  publishSystemModelHandle
} from '@fastgpt/service/core/ai/model/catalog/cache';
import { readModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import {
  createModel,
  createModelsFromTemplates,
  deleteModels,
  importSystemModels,
  restoreModelName,
  updateModel,
  updateModelOrder,
  updateModelStatus
} from '@fastgpt/service/core/ai/model/service';
import { MongoModelStatusProbeRecord } from '@fastgpt/service/core/ai/modelStatus/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const proxy = vi.hoisted(() => ({ append: vi.fn(), rename: vi.fn(), remove: vi.fn() }));
// 只替换渠道 I/O 边界，模型、版本、ACL 和补偿更新均执行真实数据库实现。
vi.mock('@fastgpt/service/core/ai/model/channel/binding', () => ({
  updateModelChannelBindings: proxy.append,
  syncModelNameInChannels: proxy.rename,
  removeModelsFromChannels: proxy.remove
}));

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
  it.each([
    { type: 'duration' as const, unitPrice: 0.2 },
    { type: 'tokens' as const, unitPrice: 10 }
  ])('round-trips STT $type pricing through Mongo and the runtime catalog', async (pricing) => {
    const created = await createModel({
      ...owner,
      modelData: { ...draft, type: ModelTypeEnum.stt, config: {}, pricing }
    });
    const stored = await MongoAIModel.findById(created.modelId).lean();
    expect(stored?.pricing).toMatchObject(pricing);
    expect(
      getCachedSystemModelHandle()
        ?.getSystemModels()
        .find((model) => model.modelId === created.modelId)?.pricing
    ).toEqual(pricing);
    const changed =
      pricing.type === 'tokens'
        ? { type: 'duration' as const, unitPrice: 0.2 }
        : { type: 'tokens' as const, unitPrice: 20 };
    await updateModel({
      ...owner,
      modelId: created.modelId,
      modelData: { ...draft, type: ModelTypeEnum.stt, config: {}, pricing: changed }
    });
    expect((await MongoAIModel.findById(created.modelId).lean())?.pricing).toMatchObject(changed);
  });

  it('reads legacy STT database pricing without writing it back', async () => {
    const raw = { ...draft, type: ModelTypeEnum.stt, config: {}, pricing: { unitPrice: 0.2 } };
    const { insertedId } = await MongoAIModel.collection.insertOne(raw);
    const stored = await MongoAIModel.findById(insertedId).lean();
    expect(formatDbModelToRuntimeModel(stored!, { fallbackProvider: true }).pricing).toEqual({
      type: 'duration',
      unitPrice: 0.2
    });
    expect((await MongoAIModel.findById(insertedId).lean())?.pricing).toEqual({ unitPrice: 0.2 });
  });

  it('rewrites complete order with consecutive ranks without changing runtime fallback order', async () => {
    const first = await createModel({ ...owner, modelData: draft });
    const second = await createModel({ ...owner, modelData: { ...draft, model: 'second' } });

    // 完整顺序保存后，rank 从 1 开始连续赋值。
    await updateModelOrder({
      ...owner,
      modelIds: [first.modelId, second.modelId]
    });

    const orderedModels = await MongoAIModel.find({ scope: ModelScopeEnum.system })
      .sort({ sortOrder: 1 })
      .lean();
    expect(orderedModels.map(({ model }) => model)).toEqual(['original', 'second']);
    expect(orderedModels.map(({ sortOrder }) => sortOrder)).toEqual([1, 2]);

    // 自定义顺序只用于管理员展示；ModelHandle 保持原有 `_id DESC` 的默认回退次序。
    expect(
      getCachedSystemModelHandle()
        ?.getSystemModels()
        .map((model) => model.modelId)
    ).toEqual([second.modelId, first.modelId]);
    expect(getCachedSystemModelHandle()?.getDefaultModelIds()[ModelTypeEnum.llm]).toBe(
      second.modelId
    );

    await expect(
      updateModelOrder({
        ...owner,
        modelIds: [first.modelId, '68ad85a7463006c963799a07']
      })
    ).rejects.toThrow('modelUnExist');
  });

  it('places newly created, template-installed and JSON-imported models at the top with leading rank 0', async () => {
    const first = await createModel({ ...owner, modelData: draft });
    const second = await createModel({ ...owner, modelData: { ...draft, model: 'second' } });
    await updateModelOrder({
      ...owner,
      modelIds: [first.modelId, second.modelId]
    });

    // 模拟历史未设置 sortOrder 的存量模型，应始终保留在末尾兜底。
    await MongoAIModel.create({ ...draft, model: 'legacy-unranked' });

    await createModel({ ...owner, modelData: { ...draft, model: 'newer' } });
    const newest = await createModel({ ...owner, modelData: { ...draft, model: 'newest' } });
    const afterSingleCreate = sortModelOrderItems(
      await MongoAIModel.find({ scope: ModelScopeEnum.system }).sort({ _id: -1 }).lean()
    );
    expect(afterSingleCreate.map(({ model, sortOrder }) => ({ model, sortOrder }))).toEqual([
      { model: 'newest', sortOrder: 0 },
      { model: 'newer', sortOrder: 0 },
      { model: 'original', sortOrder: 1 },
      { model: 'second', sortOrder: 2 },
      { model: 'legacy-unranked', sortOrder: undefined }
    ]);

    const templates = await import('@fastgpt/service/core/ai/model/template');
    const tplA = { ...draft, model: 'tpl-a', sortOrder: 99 };
    const tplB = { ...draft, model: 'tpl-b', sortOrder: 88 };
    const templateSpy = vi
      .spyOn(templates, 'refreshModelTemplates')
      .mockResolvedValue([draft, tplA, tplB]);
    try {
      await createModelsFromTemplates({
        ...owner,
        templates: [draft, tplA, tplB].map(({ model, type }) => ({ model, type }))
      });
    } finally {
      templateSpy.mockRestore();
    }

    const afterTemplateCreate = sortModelOrderItems(
      await MongoAIModel.find({ scope: ModelScopeEnum.system }).sort({ _id: -1 }).lean()
    );
    expect(afterTemplateCreate.map(({ model, sortOrder }) => ({ model, sortOrder }))).toEqual([
      { model: 'tpl-b', sortOrder: 0 },
      { model: 'tpl-a', sortOrder: 0 },
      { model: 'newest', sortOrder: 0 },
      { model: 'newer', sortOrder: 0 },
      { model: 'original', sortOrder: 1 },
      { model: 'second', sortOrder: 2 },
      { model: 'legacy-unranked', sortOrder: undefined }
    ]);

    // 手动保存完整顺序后，所有置顶 `0` 与缺省值会被统一归一化为连续的 1..N。
    await updateModelOrder({
      ...owner,
      modelIds: afterTemplateCreate.map(({ _id }) => String(_id))
    });

    await importSystemModels({
      config: [
        { ...draft, modelId: newest.modelId, model: 'newest' },
        { ...draft, modelId: 'external-json-a', model: 'json-a' },
        { ...draft, modelId: first.modelId, model: 'original' },
        { ...draft, modelId: 'external-json-b', model: 'json-b' }
      ]
    });

    const runtimeOrderedModels = await MongoAIModel.find({ scope: ModelScopeEnum.system })
      .sort({ _id: -1 })
      .lean();
    const afterJsonImport = sortModelOrderItems(runtimeOrderedModels);
    expect(afterJsonImport.map(({ model, sortOrder }) => ({ model, sortOrder }))).toEqual([
      { model: 'json-b', sortOrder: 0 },
      { model: 'json-a', sortOrder: 0 },
      { model: 'newest', sortOrder: 3 },
      { model: 'original', sortOrder: 5 }
    ]);
    // create 与 upsert 的 ObjectId 可能分别由客户端和服务端生成，同秒内不能按导入先后推断大小。
    // 管理列表继续验证 rank；运行目录和默认回退独立按数据库的 `_id DESC` 校验。
    const handle = getCachedSystemModelHandle();
    expect(handle?.getSystemModels().map((model) => model.modelId)).toEqual(
      runtimeOrderedModels.map((model) => String(model._id))
    );
    expect(handle?.getDefaultModelIds().llm).toBe(String(runtimeOrderedModels[0]._id));
  });

  it('preserves stable identity and synchronizes an edited upstream identifier', async () => {
    const model = await createModel({ ...owner, modelData: draft, channelIds: [1] });
    await updateModel({
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
    const created = await createModel({ ...owner, modelData: draft, channelIds: [1] });
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
      await createModel({ ...owner, modelData: draft });
      proxy.append.mockRejectedValueOnce(new Error('first binding failed'));
      const result = await createModelsFromTemplates({
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
    const model = await createModel({ ...owner, modelData: draft });
    proxy.rename.mockRejectedValueOnce(new Error('proxy unavailable'));
    await expect(
      updateModel({
        ...owner,
        modelId: model.modelId,
        modelData: { ...draft, model: 'renamed' }
      })
    ).rejects.toThrow('proxy unavailable');
    expect((await MongoAIModel.findById(model.modelId).lean())?.model).toBe('original');
  });
  it('imports stable IDs through the same rename and deletion cleanup used by ordinary CRUD', async () => {
    const retained = await createModel({ ...owner, modelData: draft });
    const removed = await createModel({
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
    await importSystemModels({
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
    const first = await createModel({ ...owner, modelData: draft });
    const second = await createModel({
      ...owner,
      modelData: { ...draft, model: 'second' }
    });
    await createModel({ ...owner, modelData: { ...draft, model: 'removed' } });
    proxy.rename.mockRejectedValueOnce(new Error('first rename failed'));
    await expect(
      importSystemModels({
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
    const removed = await createModel({ ...owner, modelData: draft });
    const retained = await createModel({
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
    await deleteModels({ ...owner, modelIds: [removed.modelId] });
    expect(await MongoResourcePermission.countDocuments({ resourceId: removed.modelId })).toBe(0);
    expect(await MongoModelStatusProbeRecord.countDocuments({ modelId: removed.modelId })).toBe(0);
    expect(await MongoResourcePermission.countDocuments({ resourceId: retained.modelId })).toBe(2);
    expect(await MongoModelStatusProbeRecord.countDocuments({ modelId: retained.modelId })).toBe(1);
    expect(await MongoAIModel.exists({ _id: retained.modelId })).toBeTruthy();
    expect(
      getCachedSystemModelHandle()
        ?.getAllModels()
        .map((model) => model.modelId)
    ).toEqual([retained.modelId]);
    expect(getCachedSystemModelHandle()?.revision).toBe(3);
  });

  it('keeps a committed deletion successful when channel cleanup fails', async () => {
    const model = await createModel({ ...owner, modelData: draft });
    proxy.remove.mockRejectedValueOnce(new Error('proxy unavailable'));
    expect(await deleteModels({ ...owner, modelIds: [model.modelId] })).toEqual(['original']);
    expect(await MongoAIModel.countDocuments({})).toBe(0);
  });
});

describe('team model writes', () => {
  const teamId = new Types.ObjectId().toString();
  const tmbId = new Types.ObjectId().toString();
  const owner = { channelType: 'team' as const, teamId, tmbId };
  const context = { scope: ModelScopeEnum.team, teamId } as const;
  const draft = {
    scope: ModelScopeEnum.team,
    type: ModelTypeEnum.llm as const,
    provider: 'OpenAI',
    model: 'custom',
    name: 'Custom',
    isActive: true,
    config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
  };

  beforeEach(async () => {
    await Promise.all([MongoAIModel.deleteMany({}), MongoAIModelCatalog.deleteMany({})]);
    clearTeamModelCatalogCache();
  });

  describe('team model mutations', () => {
    it('binds trusted ownership and increments only the team catalog revision', async () => {
      const result = await createModel({
        ...owner,
        modelData: { ...draft, teamId: new Types.ObjectId().toString() }
      });
      expect(await MongoAIModel.findById(result.modelId).lean()).toMatchObject({ teamId, tmbId });
      expect(await readModelCatalogRevision(context)).toBe(1);
      expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(0);
    });
    it('validates, persists and clears team custom endpoints across create, update and template install', async () => {
      const unsafeUrl = 'http://169.254.169.254/latest/meta-data';
      await expect(
        createModel({ ...owner, modelData: { ...draft, requestUrl: unsafeUrl } })
      ).rejects.toThrow('requestUrl');

      const templateModule = await import('@fastgpt/service/core/ai/model/template');
      const templateSpy = vi
        .spyOn(templateModule, 'refreshModelTemplates')
        .mockResolvedValue([{ ...draft, requestUrl: unsafeUrl }]);
      try {
        await expect(
          createModelsFromTemplates({
            ...owner,
            templates: [{ model: draft.model, type: draft.type }]
          })
        ).rejects.toThrow('requestUrl');
      } finally {
        templateSpy.mockRestore();
      }
      expect(await MongoAIModel.countDocuments({})).toBe(0);

      const created = await createModel({
        ...owner,
        modelData: {
          ...draft,
          requestUrl: 'https://93.184.216.34/v1',
          requestAuth: 'sk-team'
        }
      });
      expect(await MongoAIModel.findById(created.modelId).lean()).toMatchObject({
        requestUrl: 'https://93.184.216.34/v1',
        requestAuth: 'sk-team'
      });

      await expect(
        updateModel({
          ...owner,
          modelId: created.modelId,
          modelData: { ...draft, requestUrl: unsafeUrl }
        })
      ).rejects.toThrow('requestUrl');

      await updateModel({
        ...owner,
        modelId: created.modelId,
        modelData: { ...draft, requestUrl: '', requestAuth: '' }
      });
      const stored = await MongoAIModel.findById(created.modelId).lean();
      expect(stored?.requestUrl).toBeUndefined();
      expect(stored?.requestAuth).toBeUndefined();
    });
    it('only validates missing templates when binding already installed team models', async () => {
      const installed = await createModel({ ...owner, modelData: draft });
      const second = { ...draft, model: 'second' };
      const templateModule = await import('@fastgpt/service/core/ai/model/template');
      const templateSpy = vi
        .spyOn(templateModule, 'refreshModelTemplates')
        .mockResolvedValue([
          { ...draft, requestUrl: 'http://169.254.169.254/latest/meta-data' },
          second
        ]);
      try {
        const result = await createModelsFromTemplates({
          ...owner,
          templates: [draft, second].map(({ model, type }) => ({ model, type })),
          channelIds: [1]
        });
        expect(result.models.map(({ model }) => model)).toEqual(['second']);
        expect(proxy.append.mock.calls.map(([arg]) => arg.model)).toEqual(['custom', 'second']);
        expect((await MongoAIModel.findById(installed.modelId).lean())?.requestUrl).toBeUndefined();
      } finally {
        templateSpy.mockRestore();
      }
    });
    it('keeps team model order isolated to the owning member', async () => {
      const ownFirst = await createModel({ ...owner, modelData: draft });
      const ownSecond = await createModel({
        ...owner,
        modelData: { ...draft, model: 'second' }
      });
      const otherTmbId = new Types.ObjectId().toString();
      const other = await createModel({
        ...owner,
        tmbId: otherTmbId,
        modelData: { ...draft, model: 'other' }
      });

      await updateModelOrder({
        ...owner,
        modelIds: [ownFirst.modelId, ownSecond.modelId]
      });

      await expect(
        MongoAIModel.find({ scope: ModelScopeEnum.team, tmbId: owner.tmbId })
          .sort({ sortOrder: 1 })
          .lean()
      ).resolves.toMatchObject([
        { model: 'custom', sortOrder: 1 },
        { model: 'second', sortOrder: 2 }
      ]);
      const otherModel = await MongoAIModel.findById(other.modelId).lean();
      expect(otherModel).toMatchObject({ model: 'other', sortOrder: 0 });
      await expect(
        updateModelOrder({
          ...owner,
          modelIds: [ownSecond.modelId, other.modelId]
        })
      ).rejects.toThrow('modelUnExist');
    });

    it('rolls back a batch that includes another member model', async () => {
      const own = await createModel({ ...owner, modelData: draft });
      const other = await createModel({
        ...owner,
        tmbId: new Types.ObjectId().toString(),
        modelData: draft
      });
      await expect(
        updateModelStatus({
          modelIds: [own.modelId, other.modelId],
          isActive: false,
          channelType: 'team',
          teamId,
          tmbId
        })
      ).rejects.toThrow('modelUnExist');
      expect(await MongoAIModel.countDocuments({ isActive: true })).toBe(2);
      expect(await readModelCatalogRevision(context)).toBe(2);
    });
    it('rejects type changes and duplicate names without committing revisions', async () => {
      const a = await createModel({ ...owner, modelData: draft });
      await createModel({ ...owner, modelData: { ...draft, model: 'other' } });
      await expect(
        updateModel({ ...owner, modelId: a.modelId, modelData: { ...draft, model: 'other' } })
      ).rejects.toThrow('modelAlreadyExists');
      await expect(
        updateModel({
          ...owner,
          modelId: a.modelId,
          modelData: { ...draft, type: ModelTypeEnum.stt, config: {} }
        })
      ).rejects.toThrow('Model type cannot be changed');
      expect(await readModelCatalogRevision(context)).toBe(2);
    });
    it('does not let rename compensation overwrite a subsequent rename', async () => {
      const a = await createModel({ ...owner, modelData: draft });
      await updateModel({ ...owner, modelId: a.modelId, modelData: { ...draft, model: 'second' } });
      await updateModel({ ...owner, modelId: a.modelId, modelData: { ...draft, model: 'third' } });
      await restoreModelName({
        ...owner,
        modelId: a.modelId,
        oldModel: 'custom',
        newModel: 'second'
      });
      expect((await MongoAIModel.findById(a.modelId).lean())?.model).toBe('third');
    });
    it('rejects cross-team deletion even for a matching member ID', async () => {
      const a = await createModel({ ...owner, modelData: draft });
      await expect(
        deleteModels({ ...owner, teamId: new Types.ObjectId().toString(), modelIds: [a.modelId] })
      ).rejects.toThrow('modelUnExist');
      expect(await MongoAIModel.countDocuments({})).toBe(1);
    });
  });
});
