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
  preloadModelProviders: vi.fn().mockResolvedValue(undefined),
  getModelProvider: (provider: string) => ({ id: provider, name: provider, avatar: '', order: 0 })
}));

import {
  createSystemModel,
  createSystemModelsFromTemplates,
  deleteSystemModels
} from '@/service/core/ai/model/service';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import * as catalogEntity from '@fastgpt/service/core/ai/config/entity';
import {
  ensureSystemModelSnapshot,
  loadInstalledModels
} from '@fastgpt/service/core/ai/config/utils';
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
    global.systemModelRevision = undefined;
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
    expect(global.systemModelRevision).toBe(1);
    expect(global.systemModelList).toMatchObject([{ modelId, model: 'integration-new' }]);
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
    expect(global.systemModelList).toEqual([]);
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
    expect(global.systemModelRevision).toBe(1);
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
    expect(global.systemModelRevision).toBe(0);
    failure.mockRestore();
    await ensureSystemModelSnapshot();
    expect(global.systemModelRevision).toBe(1);
    expect(global.systemModelList).toMatchObject([{ modelId, model: 'reload-repair' }]);
  });
});
