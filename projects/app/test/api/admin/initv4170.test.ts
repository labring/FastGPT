import handler from '@/pages/api/admin/initv4170';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

const db = () => connectionMongo.connection.db;

describe('admin/initv4170 (model management migration, additive)', () => {
  it('removes the legacy model unique index and allows duplicate provider model names', async () => {
    const user = await getRootUser();
    const collection = db()!.collection('system_models');

    await collection.createIndex({ model: 1 }, { name: 'model_1', unique: true });
    await collection.insertOne({
      _id: new Types.ObjectId(),
      model: 'shared-provider-model',
      name: 'Shared A',
      type: 'llm',
      isSystem: true,
      isActive: true
    });

    const first = await Call(handler, { auth: user });
    expect(first.code).toBe(200);
    expect((await collection.indexes()).find((index) => index.name === 'model_1')).toBeUndefined();

    await expect(
      collection.insertOne({
        _id: new Types.ObjectId(),
        model: 'shared-provider-model',
        name: 'Shared B',
        type: 'llm',
        isSystem: false,
        teamId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        isActive: true
      })
    ).resolves.toBeDefined();

    const second = await Call(handler, { auth: user });
    expect(second.code).toBe(200);
    expect(await collection.countDocuments({ model: 'shared-provider-model' })).toBe(2);
  });

  it('migrates legacy system_models additively: flatten + isSystem, preserving legacy fields', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());

    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'legacy-gpt-4o',
        metadata: {
          type: 'llm',
          name: 'Legacy GPT-4o',
          provider: 'openai',
          isCustom: false,
          isDefault: true,
          isActive: true,
          maxContext: '16000',
          charsPointsPrice: '2.5',
          priceTiers:
            '[{"minInputTokens":"0","maxInputTokens":"100","inputPrice":"1","outputPrice":"2"}]'
        }
      });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    const doc = await db()!
      .collection('system_models')
      .findOne({ _id: new Types.ObjectId(modelId) });
    expect(doc).toBeTruthy();
    // additive：metadata / legacy 标记全部保留
    expect(doc.metadata).toBeTruthy();
    expect(doc.metadata.isDefault).toBe(true);
    expect(doc.metadata.isCustom).toBe(false);
    expect(doc.isDefault).toBe(true); // 缺失的顶层字段从 metadata 扁平化补齐，不删除
    expect(doc.isCustom).toBe(false);
    expect(doc.type).toBe('llm'); // 从 metadata 扁平化
    expect(doc.name).toBe('Legacy GPT-4o');
    expect(doc.provider).toBe('openai');
    expect(doc.isActive).toBe(true);
    expect(doc.maxContext).toBe(16000);
    expect(doc.charsPointsPrice).toBe(2.5);
    expect(doc.priceTiers).toEqual([
      { minInputTokens: 0, maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }
    ]);
    expect(doc.metadata.maxContext).toBe(16000);
    expect(doc.metadata.priceTiers).toEqual([
      { minInputTokens: 0, maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }
    ]);
    // isCustom:false → isSystem:true（只补不覆盖）
    expect(doc.isSystem).toBe(true);

    // 计数器
    expect(result.data.modelMigration.total).toBe(1);
    expect(result.data.modelMigration.flattened).toBe(1);
    expect(result.data.modelMigration.normalized).toBe(1);
    expect(result.data.modelMigration.isSystemSet).toBe(1);

    // Step 8：从旧 isDefault 标记创建系统默认文档（$setOnInsert）
    expect(result.data.systemDefaultInit.configured).toBe(true);
    const sysDefault = await db()!
      .collection('default_models')
      .findOne({ teamId: { $exists: false } });
    expect(sysDefault.llmId).toBe(modelId);
  });

  it('migrates datasets additively: adds *ModelId, preserves legacy fields', async () => {
    const user = await getRootUser();

    const modelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const dsId = String(new Types.ObjectId());
    await db()!
      .collection('datasets')
      .insertOne({
        _id: new Types.ObjectId(dsId),
        vectorModel: 'gpt-4o',
        // D3 residue: invalid canonical value falls back to the valid legacy field.
        vectorModelId: 'deleted-model-name',
        agentModel: 'gpt-4o',
        vlmModel: 'gpt-4o',
        name: 'test-ds'
      });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    const ds = await db()!
      .collection('datasets')
      .findOne({ _id: new Types.ObjectId(dsId) });
    expect(ds.vectorModelId).toBe(modelId);
    expect(ds.agentModelId).toBe(modelId);
    expect(ds.vlmModelId).toBe(modelId);
    // additive：legacy 字段保留（旧镜像回滚后仍可读）
    expect(ds.vectorModel).toBe('gpt-4o');
    expect(ds.agentModel).toBe('gpt-4o');
    expect(ds.vlmModel).toBe('gpt-4o');
    expect(result.data.datasetMigration.unresolved).toHaveLength(0);
  });

  it('does not write unresolved dataset model references and reports them', async () => {
    const user = await getRootUser();
    const dsId = String(new Types.ObjectId());
    await db()!
      .collection('datasets')
      .insertOne({
        _id: new Types.ObjectId(dsId),
        vectorModel: 'deleted-model-name',
        name: 'test-ds'
      });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    const ds = await db()!
      .collection('datasets')
      .findOne({ _id: new Types.ObjectId(dsId) });
    // unresolved：不写入 canonical（name 不污染 modelId 字段），legacy 保留
    expect(ds.vectorModelId).toBeUndefined();
    expect(ds.vectorModel).toBe('deleted-model-name');

    expect(result.data.datasetMigration.total).toBe(1);
    expect(result.data.datasetMigration.migrated).toBe(0);
    expect(result.data.datasetMigration.unresolved).toEqual([
      { datasetId: dsId, field: 'vectorModel', value: 'deleted-model-name' }
    ]);
  });

  it('migrates apps + app_versions additively: legacy keys kept, canonical added, W1 residue resolved', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());

    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const appId = String(new Types.ObjectId());
    await db()!
      .collection('apps')
      .insertOne({
        _id: new Types.ObjectId(appId),
        name: 'test-app',
        modules: [
          {
            inputs: [
              {
                key: 'model',
                label: 'AI model',
                renderTypeList: ['settingLLMModel', 'reference'],
                value: 'gpt-4o',
                selectedTypeIndex: 0
              },
              // W1 residue：invalid canonical value falls back to the legacy sibling.
              { key: 'modelId', value: 'deleted-model-name', selectedTypeIndex: 0 },
              // 真实 legacy key 是 'agent_datasetParams' (NodeInputKeyEnum.datasetParams)
              { key: 'agent_datasetParams', value: { embeddingModel: 'gpt-4o' } }
            ]
          }
        ],
        chatConfig: {
          questionGuide: { open: true, model: 'gpt-4o' },
          ttsConfig: { model: 'gpt-4o' }
        }
      });

    // unresolved 场景：无法解析的模型名不写入 canonical
    const badAppId = String(new Types.ObjectId());
    await db()!
      .collection('apps')
      .insertOne({
        _id: new Types.ObjectId(badAppId),
        name: 'bad-app',
        modules: [{ inputs: [{ key: 'model', value: 'deleted-model-name', selectedTypeIndex: 0 }] }]
      });

    const versionId = String(new Types.ObjectId());
    await db()!
      .collection('app_versions')
      .insertOne({
        _id: new Types.ObjectId(versionId),
        time: new Date(),
        nodes: [
          {
            inputs: [
              {
                key: 'model',
                label: 'AI model',
                renderTypeList: ['settingLLMModel', 'reference'],
                value: 'gpt-4o',
                selectedTypeIndex: 0
              }
            ]
          }
        ]
      });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);
    expect(result.data.appWorkflowMigration.appsChecked).toBe(2);
    expect(result.data.appWorkflowMigration.appsMigrated).toBe(1);
    expect(result.data.appWorkflowMigration.versionsMigrated).toBe(1);
    expect(result.data.appWorkflowMigration.conflicts).toBe(0);
    expect(result.data.appWorkflowMigration.unresolved).toContainEqual({
      appId: badAppId,
      key: 'model',
      value: 'deleted-model-name'
    });

    const app = await db()!
      .collection('apps')
      .findOne({ _id: new Types.ObjectId(appId) });
    const inputs = app.modules[0].inputs;
    // legacy input 保留
    expect(inputs.find((i: any) => i.key === 'model').value).toBe('gpt-4o');
    // W1 residue 原位解析为 id，且 canonical 不重复
    const canonicalInputs = inputs.filter((i: any) => i.key === 'modelId');
    expect(canonicalInputs).toHaveLength(1);
    expect(canonicalInputs[0].value).toBe(modelId);
    expect(canonicalInputs[0].label).toBe('AI model');
    expect(canonicalInputs[0].renderTypeList).toEqual(['settingLLMModel', 'reference']);
    // datasetParams：旧字段保留 + 补新字段
    const dp = inputs.find((i: any) => i.key === 'agent_datasetParams').value;
    expect(dp.embeddingModel).toBe('gpt-4o');
    expect(dp.embeddingModelId).toBe(modelId);
    // chatConfig：model 保留 + modelId 补齐
    expect(app.chatConfig.questionGuide.model).toBe('gpt-4o');
    expect(app.chatConfig.questionGuide.modelId).toBe(modelId);
    expect(app.chatConfig.ttsConfig.model).toBe('gpt-4o');
    expect(app.chatConfig.ttsConfig.modelId).toBe(modelId);

    // unresolved app：canonical 未写入，legacy input 保留
    const badApp = await db()!
      .collection('apps')
      .findOne({ _id: new Types.ObjectId(badAppId) });
    expect(badApp.modules[0].inputs).toHaveLength(1);
    expect(badApp.modules[0].inputs[0].key).toBe('model');
    expect(badApp.modules[0].inputs[0].value).toBe('deleted-model-name');

    // app_versions：legacy input 保留 + canonical 补齐
    const version = await db()!
      .collection('app_versions')
      .findOne({ _id: new Types.ObjectId(versionId) });
    expect(version.nodes[0].inputs.find((i: any) => i.key === 'model').value).toBe('gpt-4o');
    const versionCanonicalInput = version.nodes[0].inputs.find((i: any) => i.key === 'modelId');
    expect(versionCanonicalInput.value).toBe(modelId);
    expect(versionCanonicalInput).toMatchObject({
      key: 'modelId',
      label: 'AI model',
      renderTypeList: ['settingLLMModel', 'reference'],
      selectedTypeIndex: 0
    });
  });

  it('migrates eval additively: adds evalModelId, preserves evalModel', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const evalId = String(new Types.ObjectId());
    await db()!
      .collection('eval')
      .insertOne({ _id: new Types.ObjectId(evalId), evalModel: 'gpt-4o' });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    const doc = await db()!
      .collection('eval')
      .findOne({ _id: new Types.ObjectId(evalId) });
    expect(doc.evalModelId).toBe(modelId);
    expect(doc.evalModel).toBe('gpt-4o'); // legacy 保留
    expect(result.data.evaluationMigration.unresolved).toHaveLength(0);
  });

  it('migrates usage_items additively and counts unresolved (name never written to modelId)', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const usageId = String(new Types.ObjectId());
    await db()!
      .collection('usage_items')
      .insertOne({ _id: new Types.ObjectId(usageId), model: 'gpt-4o', totalPoints: 100 });

    // 无法解析的历史记录：name 不污染 modelId
    await db()!
      .collection('usage_items')
      .insertOne({ _id: new Types.ObjectId(), model: 'deleted-model-name', totalPoints: 50 });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    const item = await db()!
      .collection('usage_items')
      .findOne({ _id: new Types.ObjectId(usageId) });
    expect(item.modelId).toBe(modelId);
    expect(item.model).toBe('gpt-4o'); // legacy 保留

    expect(result.data.usageMigration.itemsChecked).toBe(2);
    expect(result.data.usageMigration.itemsMigrated).toBe(1);
    expect(result.data.usageMigration.unresolved).toBe(1);

    const bad = await db()!.collection('usage_items').findOne({ model: 'deleted-model-name' });
    expect(bad.modelId).toBeUndefined();
    expect(bad.model).toBe('deleted-model-name');
  });

  it('migrates MongoResourcePermission additively: adds resourceId, preserves resourceName', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const perm = await MongoResourcePermission.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      resourceType: PerResourceTypeEnum.model,
      resourceName: 'gpt-4o',
      permission: 1
    });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    const migrated = await MongoResourcePermission.findById(perm._id).lean();
    expect(String(migrated.resourceId)).toBe(modelId);
    expect(migrated.resourceName).toBe('gpt-4o'); // legacy 保留
    expect(result.data.permissionMigration.unresolved).toBe(0);
  });

  it('records ambiguous model names with deterministic first-wins', async () => {
    const user = await getRootUser();
    const idA = String(new Types.ObjectId());
    const idB = String(new Types.ObjectId());

    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(idA),
        model: 'dup-model',
        name: 'Dup A',
        type: 'llm',
        isSystem: true,
        isActive: true
      });
    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(idB),
        model: 'dup-model',
        name: 'Dup B',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const dsId = String(new Types.ObjectId());
    await db()!
      .collection('datasets')
      .insertOne({ _id: new Types.ObjectId(dsId), vectorModel: 'dup-model', name: 'ds' });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);

    // ambiguous 清单记录两个 id（供解除写冻结前人工确认）
    const dup = result.data.nameMap.ambiguous.find((a) => a.name === 'dup-model');
    expect(dup).toBeTruthy();
    expect(dup!.ids).toHaveLength(2);
    expect(dup!.ids).toContain(idA);
    expect(dup!.ids).toContain(idB);

    // 确定性 first-wins：dataset 解析到占位 id 之一
    const ds = await db()!
      .collection('datasets')
      .findOne({ _id: new Types.ObjectId(dsId) });
    expect([idA, idB]).toContain(ds.vectorModelId);
  });

  it('is idempotent: re-running has no side effects', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());

    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const dsId = String(new Types.ObjectId());
    await db()!
      .collection('datasets')
      .insertOne({ _id: new Types.ObjectId(dsId), vectorModel: 'gpt-4o', name: 'test-ds' });

    const first = await Call(handler, { auth: user });
    expect(first.code).toBe(200);
    const firstDoc = await db()!
      .collection('datasets')
      .findOne({ _id: new Types.ObjectId(dsId) });
    expect(firstDoc.vectorModelId).toBe(modelId);
    expect(firstDoc.vectorModel).toBe('gpt-4o');

    const second = await Call(handler, { auth: user });
    expect(second.code).toBe(200);
    // 重跑 no-op：canonical 已有效 → 不覆盖、不再写
    expect(second.data.datasetMigration.migrated).toBe(0);
    const secondDoc = await db()!
      .collection('datasets')
      .findOne({ _id: new Types.ObjectId(dsId) });
    expect(secondDoc.vectorModelId).toBe(modelId);
    expect(secondDoc.vectorModel).toBe('gpt-4o');
  });

  it('CAS conflict: in-flight save is not overwritten, counted as conflict, rerun completes', async () => {
    const user = await getRootUser();
    const modelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(modelId),
        model: 'gpt-4o',
        name: 'GPT-4o',
        type: 'llm',
        isSystem: true,
        isActive: true
      });

    const appId = String(new Types.ObjectId());
    const realUpdateTime = new Date('2026-01-01T00:00:00.000Z');
    await db()!
      .collection('apps')
      .insertOne({
        _id: new Types.ObjectId(appId),
        name: 'conflict-app',
        updateTime: realUpdateTime,
        modules: [{ inputs: [{ key: 'model', value: 'gpt-4o', selectedTypeIndex: 0 }] }]
      });

    // 模拟冻结前在途保存：让迁移读到过期 updateTime → CAS（_id + updateTime）失败，
    // 在途内容不被覆盖，计入 conflicts
    const staleUpdateTime = new Date('2020-01-01T00:00:00.000Z');
    const mongoDb = db()!;
    const originalCollection = mongoDb.collection.bind(mongoDb);
    const collectionSpy = vi.spyOn(mongoDb, 'collection').mockImplementation(((
      name: string,
      ...rest: unknown[]
    ) => {
      const coll = originalCollection(name, ...(rest as [any?]));
      if (name === 'apps') {
        const originalFind = coll.find.bind(coll);
        coll.find = ((filter?: any, options?: any) => {
          const cursor = originalFind(filter, options);
          const originalNext = cursor.next.bind(cursor);
          cursor.next = async () => {
            const doc = await originalNext();
            if (doc && String(doc._id) === appId) doc.updateTime = staleUpdateTime;
            return doc;
          };
          return cursor;
        }) as any;
      }
      return coll;
    }) as any);

    try {
      const result = await Call(handler, { auth: user });
      expect(result.code).toBe(200);
      expect(result.data.datasetMigration.conflicts).toBe(0);
      expect(result.data.appWorkflowMigration.appsChecked).toBe(1);
      expect(result.data.appWorkflowMigration.appsMigrated).toBe(0);
      expect(result.data.appWorkflowMigration.conflicts).toBe(1);
    } finally {
      collectionSpy.mockRestore();
    }

    // 在途内容未被覆盖：canonical 未写入，legacy input 原样保留
    const after = await db()!
      .collection('apps')
      .findOne({ _id: new Types.ObjectId(appId) });
    expect(after.modules[0].inputs).toHaveLength(1);
    expect(after.modules[0].inputs[0].key).toBe('model');
    expect(after.modules[0].inputs[0].value).toBe('gpt-4o');

    // 重跑迁移 → conflicts 归零，迁移完成
    const rerun = await Call(handler, { auth: user });
    expect(rerun.code).toBe(200);
    expect(rerun.data.appWorkflowMigration.conflicts).toBe(0);
    expect(rerun.data.appWorkflowMigration.appsMigrated).toBe(1);

    const migrated = await db()!
      .collection('apps')
      .findOne({ _id: new Types.ObjectId(appId) });
    expect(migrated.modules[0].inputs.find((i: any) => i.key === 'modelId').value).toBe(modelId);
  });

  it('does not overwrite a canonical dataset model changed after migration read', async () => {
    const user = await getRootUser();
    const legacyModelId = String(new Types.ObjectId());
    const concurrentModelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertMany([
        {
          _id: new Types.ObjectId(legacyModelId),
          model: 'legacy-embedding',
          name: 'Legacy Embedding',
          type: 'embedding',
          isSystem: true,
          isActive: true
        },
        {
          _id: new Types.ObjectId(concurrentModelId),
          model: 'concurrent-embedding',
          name: 'Concurrent Embedding',
          type: 'embedding',
          isSystem: true,
          isActive: true
        }
      ]);

    const datasetId = new Types.ObjectId();
    await db()!.collection('datasets').insertOne({
      _id: datasetId,
      name: 'concurrent-dataset',
      vectorModel: 'legacy-embedding'
    });

    const mongoDb = db()!;
    const originalCollection = mongoDb.collection.bind(mongoDb);
    let injected = false;
    const collectionSpy = vi.spyOn(mongoDb, 'collection').mockImplementation(((name: string) => {
      const collection = originalCollection(name);
      if (name === 'datasets') {
        const originalBulkWrite = collection.bulkWrite.bind(collection);
        collection.bulkWrite = (async (...args: Parameters<typeof originalBulkWrite>) => {
          if (!injected) {
            injected = true;
            await originalCollection('datasets').updateOne(
              { _id: datasetId },
              { $set: { vectorModelId: concurrentModelId } }
            );
          }
          return originalBulkWrite(...args);
        }) as typeof collection.bulkWrite;
      }
      return collection;
    }) as any);

    try {
      const result = await Call(handler, { auth: user });
      expect(result.code).toBe(200);
    } finally {
      collectionSpy.mockRestore();
    }

    const dataset = await db()!.collection('datasets').findOne({ _id: datasetId });
    expect(dataset?.vectorModelId).toBe(concurrentModelId);
  });

  it('does not overwrite concurrent canonical writes in eval, usage, or permissions', async () => {
    const user = await getRootUser();
    const legacyModelId = String(new Types.ObjectId());
    const concurrentModelId = String(new Types.ObjectId());
    await db()!
      .collection('system_models')
      .insertMany([
        {
          _id: new Types.ObjectId(legacyModelId),
          model: 'legacy-llm',
          name: 'Legacy LLM',
          type: 'llm',
          isSystem: true,
          isActive: true
        },
        {
          _id: new Types.ObjectId(concurrentModelId),
          model: 'concurrent-llm',
          name: 'Concurrent LLM',
          type: 'llm',
          isSystem: true,
          isActive: true
        }
      ]);

    const evalId = new Types.ObjectId();
    const usageItemId = new Types.ObjectId();
    const permissionId = new Types.ObjectId();
    await db()!.collection('eval').insertOne({ _id: evalId, evalModel: 'legacy-llm' });
    await db()!.collection('usage_items').insertOne({
      _id: usageItemId,
      model: 'legacy-llm'
    });
    await db()!.collection('resource_permissions').insertOne({
      _id: permissionId,
      resourceType: PerResourceTypeEnum.model,
      resourceName: 'legacy-llm'
    });

    const mongoDb = db()!;
    const originalCollection = mongoDb.collection.bind(mongoDb);
    const injected = new Set<string>();
    const collectionSpy = vi.spyOn(mongoDb, 'collection').mockImplementation(((name: string) => {
      const collection = originalCollection(name);
      if (['eval', 'usage_items', 'resource_permissions'].includes(name)) {
        const originalBulkWrite = collection.bulkWrite.bind(collection);
        collection.bulkWrite = (async (...args: Parameters<typeof originalBulkWrite>) => {
          if (!injected.has(name)) {
            injected.add(name);
            const target = (() => {
              if (name === 'eval') return { _id: evalId, field: 'evalModelId' };
              if (name === 'usage_items') return { _id: usageItemId, field: 'modelId' };
              return { _id: permissionId, field: 'resourceId' };
            })();
            await originalCollection(name).updateOne(
              { _id: target._id },
              { $set: { [target.field]: concurrentModelId } }
            );
          }
          return originalBulkWrite(...args);
        }) as typeof collection.bulkWrite;
      }
      return collection;
    }) as any);

    try {
      const result = await Call(handler, { auth: user });
      expect(result.code).toBe(200);
      expect(result.data.evaluationMigration.conflicts).toBe(1);
      expect(result.data.usageMigration.conflicts).toBe(1);
      expect(result.data.permissionMigration.conflicts).toBe(1);
    } finally {
      collectionSpy.mockRestore();
    }

    expect((await db()!.collection('eval').findOne({ _id: evalId }))?.evalModelId).toBe(
      concurrentModelId
    );
    expect((await db()!.collection('usage_items').findOne({ _id: usageItemId }))?.modelId).toBe(
      concurrentModelId
    );
    expect(
      (await db()!.collection('resource_permissions').findOne({ _id: permissionId }))?.resourceId
    ).toBe(concurrentModelId);
  });

  it('skips channel migration when aiproxy is not configured', async () => {
    const user = await getRootUser();

    await db()!
      .collection('system_models')
      .insertOne({
        _id: new Types.ObjectId(),
        model: 'legacy-custom-model',
        metadata: {
          type: 'llm',
          name: 'Legacy Custom',
          provider: 'custom',
          requestUrl: 'https://example.com/v1',
          requestAuth: 'sk-legacy-key'
        }
      });

    const result = await Call(handler, { auth: user });
    expect(result.code).toBe(200);
    // aiproxy 未配置 → skipped，不 failed
    expect(result.data.channelMigration.skipped).toBeGreaterThan(0);
    expect(result.data.channelMigration.created).toBe(0);

    // legacy requestUrl/requestAuth 保留在 system_models（不删除）
    const doc = await db()!.collection('system_models').findOne({ model: 'legacy-custom-model' });
    expect(doc.metadata.requestUrl).toBe('https://example.com/v1');
    expect(doc.metadata.requestAuth).toBe('sk-legacy-key');
  });
});
