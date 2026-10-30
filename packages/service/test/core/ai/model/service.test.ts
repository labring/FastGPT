import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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
  it.each(['system', 'team'] as const)(
    'ignores supplied ranks when creating %s models',
    async (channelType) => {
      const modelOwner =
        channelType === 'team'
          ? {
              channelType,
              teamId: new Types.ObjectId().toString(),
              tmbId: new Types.ObjectId().toString()
            }
          : owner;
      const modelData = { ...draft, sortOrder: 123 };
      const created = await createModel({ ...modelOwner, modelData });
      const stored = await MongoAIModel.findById(created.modelId).lean();

      expect(stored).toMatchObject({ model: draft.model, scope: channelType });
      expect(stored).not.toHaveProperty('sortOrder');
    }
  );

  it.each([0, undefined])(
    'preserves persisted ranks through configuration updates with rank %s',
    async (sortOrder) => {
      const first = await createModel({ ...owner, modelData: draft });
      const second = await createModel({ ...owner, modelData: { ...draft, model: 'second' } });
      await updateModelOrder({
        ...owner,
        moves: [{ modelId: first.modelId, beforeModelId: second.modelId }]
      });
      const before = await MongoAIModel.findById(first.modelId).lean();
      const modelData = { ...draft, name: 'Edited', sortOrder };
      await updateModel({ ...owner, modelId: first.modelId, modelData });

      expect(await MongoAIModel.findById(first.modelId).lean()).toMatchObject({
        name: 'Edited',
        sortOrder: before!.sortOrder
      });
    }
  );

  it.each([true, false])(
    'preserves local ranks and ignores imported ranks (supplied: %s)',
    async (supplied) => {
      const first = await createModel({ ...owner, modelData: draft });
      const second = await createModel({ ...owner, modelData: { ...draft, model: 'second' } });
      await updateModelOrder({
        ...owner,
        moves: [{ modelId: first.modelId, beforeModelId: second.modelId }]
      });
      const before = await MongoAIModel.find({ scope: ModelScopeEnum.system })
        .sort({ sortOrder: 1 })
        .lean();
      const importedRank = supplied ? { sortOrder: 0 } : {};
      await importSystemModels({
        config: [
          { ...draft, modelId: first.modelId, name: 'Imported', ...importedRank },
          { ...draft, model: 'second', modelId: 'external-second', ...importedRank },
          { ...draft, model: 'new-model', modelId: 'external-new', ...importedRank }
        ]
      });

      for (const model of before) {
        expect(await MongoAIModel.findById(model._id).lean()).toMatchObject({
          sortOrder: model.sortOrder
        });
      }
      expect(await MongoAIModel.findById(first.modelId).lean()).toMatchObject({ name: 'Imported' });
      expect(await MongoAIModel.findOne({ model: 'new-model' }).lean()).not.toHaveProperty(
        'sortOrder'
      );
    }
  );

  it('saves relative moves with sparse ranks without changing runtime fallback order', async () => {
    const first = await createModel({ ...owner, modelData: draft });
    const second = await createModel({ ...owner, modelData: { ...draft, model: 'second' } });

    // 顺序已满足的保存不应仅为回填 rank 扫写整个历史列表或推进目录 revision。
    await updateModelOrder({
      ...owner,
      moves: [{ modelId: second.modelId, beforeModelId: first.modelId }]
    });
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(2);
    expect(await MongoAIModel.exists({ sortOrder: { $exists: true } })).toBeNull();

    // 新建时的旧展示顺序是 `_id DESC`：second 在 first 前；将 first 移到 second 前。
    await updateModelOrder({
      ...owner,
      moves: [{ modelId: first.modelId, beforeModelId: second.modelId }]
    });

    const orderedModels = await MongoAIModel.find({ scope: ModelScopeEnum.system })
      .sort({ sortOrder: 1 })
      .lean();
    expect(orderedModels.map(({ model }) => model)).toEqual(['original', 'second']);
    expect(orderedModels.every(({ sortOrder }) => Number.isSafeInteger(sortOrder))).toBe(true);

    // 自定义顺序只用于管理员展示；ModelHandle 保持原有 `_id DESC` 的默认回退次序。
    expect(
      getCachedSystemModelHandle()
        ?.getSystemModels()
        .map((model) => model.modelId)
    ).toEqual([second.modelId, first.modelId]);
    expect(getCachedSystemModelHandle()?.getDefaultModelIds()[ModelTypeEnum.llm]).toBe(
      second.modelId
    );
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(3);

    // 当前目标位置已满足时不写 rank，也不推进 revision。
    await updateModelOrder({
      ...owner,
      moves: [{ modelId: first.modelId, beforeModelId: second.modelId }]
    });
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(3);

    await expect(
      updateModelOrder({
        ...owner,
        moves: [{ modelId: first.modelId, beforeModelId: '68ad85a7463006c963799a07' }]
      })
    ).rejects.toThrow('modelUnExist');
    expect(await readModelCatalogRevision({ scope: ModelScopeEnum.system })).toBe(3);
  });

  it('applies a batch of relative moves in order within one transaction', async () => {
    const models: Array<{ modelId: string }> = [];
    for (const model of ['first', 'second', 'third', 'fourth']) {
      models.push(await createModel({ ...owner, modelData: { ...draft, model } }));
    }
    const first = models[0]!;
    const second = models[1]!;
    const third = models[2]!;
    const fourth = models[3]!;

    // 当前 `_id DESC` 为 fourth, third, second, first；连续的锚点移动将其恢复为创建顺序。
    await updateModelOrder({
      ...owner,
      moves: [
        { modelId: third.modelId, beforeModelId: fourth.modelId },
        { modelId: second.modelId, beforeModelId: third.modelId },
        { modelId: first.modelId, beforeModelId: second.modelId }
      ]
    });

    const orderedModels = await MongoAIModel.find({ scope: ModelScopeEnum.system })
      .sort({ sortOrder: 1 })
      .lean();
    expect(orderedModels.map(({ model }) => model)).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('rebalances a local rank window when adjacent ranks have no integer gap', async () => {
    const models = await Promise.all(
      ['first', 'second', 'third', 'fourth'].map((model) =>
        createModel({ ...owner, modelData: { ...draft, model } })
      )
    );
    const orderedBefore = [...models].reverse();
    await MongoAIModel.bulkWrite(
      orderedBefore.map(({ modelId }, index) => ({
        updateOne: {
          filter: { _id: modelId },
          update: { $set: { sortOrder: index + 10 } }
        }
      }))
    );

    await updateModelOrder({
      ...owner,
      moves: [
        {
          modelId: orderedBefore[3].modelId,
          beforeModelId: orderedBefore[1].modelId
        }
      ]
    });

    const orderedAfter = await MongoAIModel.find({ scope: ModelScopeEnum.system })
      .sort({ sortOrder: 1 })
      .lean();
    expect(orderedAfter.map(({ model }) => model)).toEqual(['fourth', 'first', 'third', 'second']);
    const ranks = orderedAfter.map(({ sortOrder }) => sortOrder);
    expect(ranks.every((rank) => Number.isSafeInteger(rank))).toBe(true);
    expect(new Set(ranks).size).toBe(ranks.length);
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
    const second = { ...draft, model: 'second', sortOrder: 123 };
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
      expect(await MongoAIModel.findOne({ model: 'second' }).lean()).not.toHaveProperty(
        'sortOrder'
      );
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
        moves: [{ modelId: ownFirst.modelId, beforeModelId: ownSecond.modelId }]
      });

      await expect(
        MongoAIModel.find({ scope: ModelScopeEnum.team, tmbId: owner.tmbId })
          .sort({ sortOrder: 1 })
          .lean()
      ).resolves.toMatchObject([
        { model: 'custom', sortOrder: 500_000 },
        { model: 'second', sortOrder: 1_000_000 }
      ]);
      const otherModel = await MongoAIModel.findById(other.modelId).lean();
      expect(otherModel).toMatchObject({ model: 'other' });
      expect(otherModel).not.toHaveProperty('sortOrder');
      await expect(
        updateModelOrder({
          ...owner,
          moves: [{ modelId: ownSecond.modelId, beforeModelId: other.modelId }]
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
