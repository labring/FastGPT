import { getCachedModelHandle, publishModelHandle } from '@fastgpt/service/core/ai/config/handle';

import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { type CreateSystemModelBody } from '@fastgpt/global/openapi/admin/core/ai/model/api';

// 全局测试配置提供 MongoMemoryReplSet；这里恢复真实 session，覆盖提交与回滚。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const external = vi.hoisted(() => ({
  baseUrl: '',
  listModels: vi.fn()
}));
// 只替换外部服务的配置和 Plugin 边界，AI Proxy adapter/axios/模型目录均执行真实实现。
vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: () => ({ baseUrl: external.baseUrl, token: 'local-integration-token' })
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: { listModels: external.listModels }
}));
vi.mock('@fastgpt/service/core/app/provider/controller', () => ({
  getModelProviderMetadata: () => ({ providers: [], aiproxyChannels: [] }),
  preloadModelProviders: vi.fn().mockResolvedValue(undefined),
  getModelProvider: (provider: string) => ({ id: provider, name: provider, avatar: '', order: 0 })
}));

import {
  createSystemModel,
  createSystemModelsFromTemplates,
  deleteSystemModels,
  importSystemModels,
  updateSystemDefaultModels,
  updateSystemModel
} from '@/service/core/ai/model/service';
import { updateSystemModelStatus } from '@fastgpt/service/core/ai/config/service';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import * as catalogEntity from '@fastgpt/service/core/ai/config/entity';
import { refreshModelHandle, loadInstalledModels } from '@fastgpt/service/core/ai/config/utils';
import { appendModelsToAIProxyChannels } from '@fastgpt/service/thirdProvider/aiproxy/channel';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

type LocalChannel = { id: number; type: number; name: string; models: string[] };

/** 确定性控制 HTTP 写入的暂停点，避免通过 sleep 猜测并发时序。 */
const createGate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** 通过接口真实 schema 的推导类型构造完整草稿。 */
const createDraft = (model: string): CreateSystemModelBody['modelData'] => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: model,
  scope: ModelScopeEnum.system,
  isActive: true,
  config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
});

describe('system model management integration: HTTP + MongoDB transactions + runtime catalog', () => {
  let server: Server;
  let channels: LocalChannel[];
  let requests: Array<{ method: string; url: string; authorization: string | undefined }>;
  let failedChannelId: number | undefined;
  let writeGate: ReturnType<typeof createGate> | undefined;
  let writeStarted: ReturnType<typeof createGate> | undefined;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: req.headers.authorization
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer local-integration-token') {
        res.writeHead(401).end(JSON.stringify({ success: false }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/channels/all') {
        res.end(JSON.stringify({ success: true, data: channels }));
        return;
      }
      const channelId = Number(req.url?.match(/^\/api\/channel\/(\d+)$/)?.[1]);
      const channel = channels.find(({ id }) => id === channelId);
      if (req.method !== 'PUT' || !channel) {
        res.writeHead(404).end(JSON.stringify({ success: false }));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      writeStarted?.resolve();
      await writeGate?.promise;
      if (channelId === failedChannelId) {
        res.writeHead(503).end(JSON.stringify({ success: false }));
        return;
      }
      const update: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        !update ||
        typeof update !== 'object' ||
        !('models' in update) ||
        !Array.isArray(update.models) ||
        !update.models.every((model) => typeof model === 'string')
      ) {
        res.writeHead(400).end(JSON.stringify({ success: false }));
        return;
      }
      channel.models = update.models;
      res.end(JSON.stringify({ success: true }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
    external.baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    channels = [
      { id: 1, type: 1, name: 'one', models: ['unrelated'] },
      { id: 2, type: 1, name: 'two', models: [] }
    ];
    requests = [];
    failedChannelId = undefined;
    writeGate = undefined;
    writeStarted = undefined;
    external.listModels.mockReset().mockResolvedValue([]);
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoAIDefaultModel.deleteMany({}),
      MongoResourcePermission.deleteMany({})
    ]);
    publishModelHandle(undefined);
    await loadInstalledModels();
  });

  afterEach(() => {
    writeGate?.resolve();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('creates a model through real HTTP and publishes the committed catalog revision', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('integration-new'),
      channelIds: [1]
    });

    expect(channels[0].models).toEqual(['unrelated', 'integration-new']);
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({
      model: 'integration-new',
      isActive: true
    });
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    expect(getCachedModelHandle()?.revision).toBe(1);
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([
      { modelId, model: 'integration-new' }
    ]);
    expect(requests.map(({ method }) => method)).toEqual(['GET', 'PUT']);
    expect(
      requests.every(({ authorization }) => authorization === 'Bearer local-integration-token')
    ).toBe(true);
  });

  it('rejects duplicate creation before issuing any additional external request', async () => {
    await createSystemModel({ modelData: createDraft('duplicate'), channelIds: [1] });
    requests = [];

    await expect(
      createSystemModel({ modelData: createDraft('duplicate'), channelIds: [2] })
    ).rejects.toThrow('Model already exists');

    expect(requests).toEqual([]);
    expect(channels[1].models).toEqual([]);
    expect(await MongoAIModel.countDocuments({ model: 'duplicate' })).toBe(1);
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
  });

  it('installs templates as inactive models and removes channel bindings and permissions on delete', async () => {
    external.listModels.mockResolvedValue([createDraft('template-a'), createDraft('template-b')]);
    const result = await createSystemModelsFromTemplates({
      templates: [
        { type: ModelTypeEnum.llm, model: 'template-a' },
        { type: ModelTypeEnum.llm, model: 'template-b' }
      ],
      channelIds: [1, 2]
    });
    expect(result.models).toHaveLength(2);
    expect(await MongoAIModel.countDocuments({ isActive: false })).toBe(2);
    const modelIds = result.models.map(({ modelId }) => modelId);
    // 原生 collection 写入只准备权限夹具；删除仍经过真实应用服务和事务。
    await MongoResourcePermission.collection.insertOne({
      resourceType: PerResourceTypeEnum.model,
      resourceId: new connectionMongo.Types.ObjectId(modelIds[0])
    });

    await deleteSystemModels({ modelIds });

    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await MongoResourcePermission.countDocuments()).toBe(0);
    expect(channels.map(({ models }) => models)).toEqual([['unrelated'], []]);
    expect(getCachedModelHandle()?.getAllModels()).toEqual([]);
    expect(await catalogEntity.readSystemModelRevision()).toBe(2);
  });

  it('keeps the accepted partial external success without writing MongoDB when a later channel fails', async () => {
    failedChannelId = 2;

    await expect(
      createSystemModel({ modelData: createDraft('partial'), channelIds: [1, 2] })
    ).rejects.toThrow();

    expect(channels.map(({ models }) => models)).toEqual([['unrelated', 'partial'], []]);
    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await catalogEntity.readSystemModelRevision()).toBe(0);
  });

  it('rolls back model deletion and revision when permission deletion fails inside the transaction', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('rollback-delete'),
      channelIds: [1]
    });
    // 在事务内模型删除之后注入下一条数据库操作失败，验证真实 MongoDB 回滚。
    vi.spyOn(MongoResourcePermission, 'deleteMany').mockImplementationOnce(() => {
      throw new Error('Injected permission delete failure');
    });

    await expect(deleteSystemModels({ modelIds: [modelId] })).rejects.toThrow(
      'Injected permission delete failure'
    );

    expect(await MongoAIModel.findById(modelId).lean()).not.toBeNull();
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    // 已提交的外部解绑不属于 MongoDB 事务，遵守已确认的不补偿约定。
    expect(channels[0].models).toEqual(['unrelated']);
    expect(getCachedModelHandle()?.revision).toBe(1);
  });

  it('rejects competing writers while a lease is held and preserves both changes after retry', async () => {
    writeGate = createGate();
    writeStarted = createGate();
    const first = appendModelsToAIProxyChannels({ channelIds: [1], models: ['first'] });
    try {
      await writeStarted.promise;
      await expect(
        appendModelsToAIProxyChannels({ channelIds: [1], models: ['second'] })
      ).rejects.toThrow('being updated');
      expect(requests).toHaveLength(2);
    } finally {
      writeGate.resolve();
      await first;
    }

    await appendModelsToAIProxyChannels({ channelIds: [1], models: ['second'] });

    expect(channels[0].models).toEqual(['unrelated', 'first', 'second']);
  });

  it('returns committed creation after reload failure and repairs the snapshot at the next read barrier', async () => {
    const failure = vi
      .spyOn(catalogEntity, 'readSystemModelSnapshot')
      .mockRejectedValueOnce(new Error('Injected snapshot read failure'));

    const { modelId } = await createSystemModel({
      modelData: createDraft('reload-repair'),
      channelIds: [1]
    });

    expect(await MongoAIModel.findById(modelId).lean()).not.toBeNull();
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    expect(getCachedModelHandle()?.revision).toBe(0);
    failure.mockRestore();
    await refreshModelHandle();
    expect(getCachedModelHandle()?.revision).toBe(1);
    expect(getCachedModelHandle()?.getAllModels()).toMatchObject([
      { modelId, model: 'reload-repair' }
    ]);
  });

  it('rejects the entire template batch before external writes when one template disappears', async () => {
    external.listModels.mockResolvedValue([createDraft('available')]);
    await expect(
      createSystemModelsFromTemplates({
        templates: [
          { type: ModelTypeEnum.llm, model: 'available' },
          { type: ModelTypeEnum.llm, model: 'removed' }
        ],
        channelIds: [1, 2]
      })
    ).rejects.toThrow('no longer exists');
    expect(requests).toEqual([]);
    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await catalogEntity.readSystemModelRevision()).toBe(0);
  });

  it('uses the latest template parameters, skips installed names and leaves instances unchanged later', async () => {
    const installed = await createSystemModel({
      modelData: createDraft('installed'),
      channelIds: []
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
      ],
      channelIds: []
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
    expect(getCachedModelHandle()?.getAllModels()).toHaveLength(2);
    expect(external.listModels).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([]);
  });

  it('rolls back a partially matched status update without advancing revision or snapshot', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('status'),
      channelIds: []
    });
    const missingId = new connectionMongo.Types.ObjectId().toString();
    await expect(
      updateSystemModelStatus({ modelIds: [modelId, missingId], isActive: false })
    ).rejects.toBeDefined();
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({ isActive: true });
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    expect(getCachedModelHandle()?.revision).toBe(1);
    await updateSystemModelStatus({ modelIds: [modelId], isActive: false });
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({ isActive: false });
    expect(await catalogEntity.readSystemModelRevision()).toBe(2);
  });

  it('preserves configured defaults when creating another model and rolls back invalid default changes', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('default'),
      channelIds: []
    });
    await updateSystemDefaultModels({ llm: modelId, chatTitleLLMModelId: modelId });
    const defaultsBefore = await MongoAIDefaultModel.find({}, { defaultModelIds: 1 }).lean();
    const second = await createSystemModel({ modelData: createDraft('second'), channelIds: [] });
    expect(second.modelId).not.toBe(modelId);
    expect(await MongoAIDefaultModel.find({}, { defaultModelIds: 1 }).lean()).toEqual(
      defaultsBefore
    );
    const revision = await catalogEntity.readSystemModelRevision();
    await expect(
      updateSystemDefaultModels({ llm: second.modelId, datasetImageLLMModelId: modelId })
    ).rejects.toBeDefined();
    expect(await MongoAIDefaultModel.find({}, { defaultModelIds: 1 }).lean()).toEqual(
      defaultsBefore
    );
    expect(await catalogEntity.readSystemModelRevision()).toBe(revision);
    await updateSystemDefaultModels({});
    expect(await catalogEntity.readSystemModelRevision()).toBe(revision + 1);
  });

  it('prechecks immutable type before channel replacement and clears omitted request credentials on update', async () => {
    const { modelId } = await createSystemModel({
      modelData: {
        ...createDraft('editable'),
        requestUrl: 'http://local.test',
        requestAuth: 'test-secret'
      },
      channelIds: [1]
    });
    requests = [];
    const { model: _model, ...editable } = createDraft('editable');
    await expect(
      updateSystemModel({
        modelId,
        modelData: { ...editable, type: ModelTypeEnum.stt, config: {} },
        channelIds: [2]
      })
    ).rejects.toThrow('type cannot be changed');
    expect(requests).toEqual([]);
    await updateSystemModel({
      modelId,
      modelData: { ...editable, name: 'Renamed' },
      channelIds: [2]
    });
    const updated = await MongoAIModel.findById(modelId).lean();
    expect(updated).toMatchObject({ name: 'Renamed', model: 'editable', type: 'llm' });
    expect(updated).not.toHaveProperty('requestUrl');
    expect(updated).not.toHaveProperty('requestAuth');
    expect(channels.map(({ models }) => models)).toEqual([['unrelated'], ['editable']]);
  });

  it('keeps JSON import atomic and distinguishes legacy no-ID records from deliberate empty configuration', async () => {
    const { modelId } = await createSystemModel({
      modelData: createDraft('json-original'),
      channelIds: []
    });
    const before = await MongoAIModel.find({}).lean();
    await expect(
      importSystemModels({
        config: [
          { ...createDraft('external'), modelId: 'external' },
          { ...createDraft('invalid'), modelId: 'invalid', config: { maxContext: 'bad' } }
        ]
      })
    ).rejects.toThrow('Invalid system model');
    expect(await MongoAIModel.find({}).lean()).toEqual(before);
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    await importSystemModels({ config: [createDraft('legacy')] });
    expect(await MongoAIModel.find({}).lean()).toEqual(before);
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    await importSystemModels({
      config: [
        {
          ...createDraft('injected-name'),
          modelId,
          type: ModelTypeEnum.stt,
          name: 'Imported',
          inputPrice: 0,
          outputPrice: 2
        }
      ]
    });
    const imported = await MongoAIModel.findById(modelId).lean();
    expect(imported).toMatchObject({ model: 'json-original', type: 'llm', name: 'Imported' });
    expect(imported).not.toHaveProperty('inputPrice');
    expect(imported).not.toHaveProperty('outputPrice');
    expect(imported?.priceTiers).toEqual(
      expect.arrayContaining([expect.objectContaining({ inputPrice: 0, outputPrice: 2 })])
    );
    await importSystemModels({ config: [] });
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({ isActive: false });
    expect(await MongoAIModel.countDocuments()).toBe(1);
  });

  it('rolls back MongoDB after successful channel writes and deduplicates external bindings on retry', async () => {
    const beforeDefaults = await MongoAIDefaultModel.findOne().lean();
    // 在真实事务已增加 revision 后注入模型写入失败；HTTP 渠道写入已经完成。
    vi.spyOn(MongoAIModel, 'create').mockImplementationOnce(() => {
      throw new Error('Injected model insert failure');
    });
    const input = { modelData: createDraft('retry-after-db-failure'), channelIds: [1, 2] };

    await expect(createSystemModel(input)).rejects.toThrow('Injected model insert failure');

    expect(await MongoAIModel.countDocuments()).toBe(0);
    expect(await MongoAIDefaultModel.findOne().lean()).toEqual(beforeDefaults);
    expect(await catalogEntity.readSystemModelRevision()).toBe(0);
    expect(getCachedModelHandle()?.getAllModels()).toEqual([]);
    expect(channels.map(({ models }) => models)).toEqual([
      ['unrelated', 'retry-after-db-failure'],
      ['retry-after-db-failure']
    ]);

    await createSystemModel(input);

    expect(await MongoAIModel.countDocuments()).toBe(1);
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
    expect(channels.map(({ models }) => models)).toEqual([
      ['unrelated', 'retry-after-db-failure'],
      ['retry-after-db-failure']
    ]);
  });

  it('rejects concurrent duplicate creation through the real unique index with one committed revision', async () => {
    const results = await Promise.allSettled([
      createSystemModel({ modelData: createDraft('concurrent'), channelIds: [] }),
      createSystemModel({ modelData: createDraft('concurrent'), channelIds: [] })
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await MongoAIModel.countDocuments({ model: 'concurrent' })).toBe(1);
    expect(await catalogEntity.readSystemModelRevision()).toBe(1);
  });
});
