import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  TeamModelCreatePermissionVal,
  TeamReadPermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { publishSystemModelHandle } from '@fastgpt/service/core/ai/model/cache';
import { loadInstalledModels } from '@fastgpt/service/core/ai/model/catalog/service';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getRootUser, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { parseHeaderCertRet } from '@test/mocks/request';

// 恢复真实 session，模型删除要走真实 MongoDB 事务。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const external = vi.hoisted(() => ({
  baseUrl: '',
  listModels: vi.fn()
}));
// 只替换外部服务边界：AI Proxy 指向本地 HTTP 服务，Plugin 模板由用例注入；
// 权限、Mongo、模型目录和 API handler 都执行真实实现。
vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: () => ({ baseUrl: external.baseUrl, token: 'local-integration-token' })
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: { listModels: external.listModels }
}));
vi.mock('@fastgpt/service/core/ai/model/provider/controller', () => ({
  getModelProviderMetadata: () => ({ providers: [], aiproxyChannels: [] }),
  preloadModelProviders: vi.fn().mockResolvedValue(undefined),
  getModelProvider: (provider: string) => ({ id: provider, name: provider, avatar: '', order: 0 })
}));

import templatesHandler from '@/pages/api/core/ai/model/templates';
import createHandler from '@/pages/api/core/ai/model/create';
import createFromTemplatesHandler from '@/pages/api/core/ai/model/createFromTemplates';
import deleteHandler from '@/pages/api/core/ai/model/delete';
import updateChannelsHandler from '@/pages/api/core/ai/model/updateChannels';
import modelConfigHandler from '@/pages/api/core/ai/model/config';
import channelListHandler from '@/pages/api/core/ai/model/channel/list';
import channelCreateHandler from '@/pages/api/core/ai/model/channel/create';
import channelLogsHandler from '@/pages/api/core/ai/model/channel/logs';

type MockChannel = {
  id: number;
  type: number;
  name: string;
  key: string;
  models: string[];
  model_mapping?: Record<string, string>;
  priority?: number;
  configs?: Record<string, unknown>;
  status: 1 | 2;
  group_id?: string;
};

const GROUP_PATH = /^\/api\/group\/([^/]+)\/channel(s)?(?:\/(\d+|search))?\/?(?:\?.*)?$/;

/** 构造完整的模型草稿，team/system 作用域由接口入参决定，不信任草稿里的归属字段。 */
const modelDraft = (model: string, name = model) => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name,
  scope: ModelScopeEnum.team,
  isActive: true,
  config: { maxContext: 32000, maxResponse: 16000, quoteMaxToken: 24000 }
});

/** 授予成员“安装模型”权限；不授予则仅有默认的只读成员权限。 */
const grantInstallModel = (user: parseHeaderCertRet) =>
  MongoResourcePermission.create({
    resourceType: PerResourceTypeEnum.team,
    teamId: user.teamId,
    resourceId: null,
    tmbId: user.tmbId,
    permission: TeamModelCreatePermissionVal | TeamReadPermissionVal
  });

describe('team model management integration: permission, member isolation and AI Proxy sync', () => {
  let server: Server;
  /** 本地 AI Proxy 的渠道存储，按 groupId 分桶；'system' 为系统渠道桶。 */
  let buckets: Map<string, MockChannel[]>;
  let requests: Array<{ method: string; url: string }>;

  const bucketOf = (groupId: string) => {
    if (!buckets.has(groupId)) buckets.set(groupId, []);
    return buckets.get(groupId)!;
  };
  const addChannel = (groupId: string, channel: Omit<MockChannel, 'type' | 'status' | 'key'>) => {
    const created: MockChannel = {
      type: 1,
      status: 1,
      key: `sk-secret-${channel.id}`,
      ...channel,
      ...(groupId === 'system' ? {} : { group_id: groupId })
    };
    bucketOf(groupId).push(created);
    return created;
  };

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = req.url ?? '';
      requests.push({ method: req.method ?? '', url });
      res.setHeader('Content-Type', 'application/json');
      const ok = (data?: unknown) => res.end(JSON.stringify({ success: true, data }));
      const notFound = () => res.writeHead(404).end(JSON.stringify({ success: false }));

      if (req.headers.authorization !== 'Bearer local-integration-token') {
        res.writeHead(401).end(JSON.stringify({ success: false }));
        return;
      }

      const match = url.match(GROUP_PATH);
      if (!match) return notFound();
      const groupId = decodeURIComponent(match[1]);
      const id = match[3] && match[3] !== 'search' ? Number(match[3]) : undefined;
      const bucket = buckets.get(groupId);

      if (req.method === 'POST' && !match[2] && id === undefined) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const channel = {
          ...body,
          id: (bucket?.length ?? 0) + 1,
          group_id: groupId,
          status: body.status ?? 1
        };
        bucketOf(groupId).push(channel);
        // 模拟上游旧版空创建结果，适配层应在同一成员分组内补齐 ID。
        return ok();
      }

      // 列表：桶不存在时与真实 AI Proxy 一致返回 404，由服务端按空列表容错
      if (req.method === 'GET' && id === undefined) {
        if (!bucket) return notFound();
        return ok({ channels: bucket, total: bucket.length });
      }
      const channel = bucket?.find((item) => item.id === id);
      if (!channel) return notFound();
      if (req.method === 'GET') return ok(channel);
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        // AI Proxy 的 PUT 是 patch 语义：仅更新显式提供的非 undefined 字段
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<MockChannel>;
        if (body.name !== undefined) channel.name = body.name;
        if (body.type !== undefined) channel.type = body.type;
        if (body.key !== undefined) channel.key = body.key;
        if (body.models !== undefined) channel.models = body.models;
        if (body.model_mapping !== undefined) channel.model_mapping = body.model_mapping;
        if (body.priority !== undefined) channel.priority = body.priority;
        if (body.status !== undefined) channel.status = body.status;
        return ok();
      }
      return notFound();
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
    external.baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  beforeEach(async () => {
    // 团队模型/渠道仅商业版可用
    global.feConfigs = { isPlus: true } as typeof global.feConfigs;
    buckets = new Map();
    requests = [];
    external.listModels.mockReset().mockResolvedValue([]);
    publishSystemModelHandle(undefined);
    await loadInstalledModels();
  });

  /** 创建同团队的有权限成员（owner 之外）、无权限成员与另一个有权限成员。 */
  const createMembers = async () => {
    const owner = await getUser(`owner-${Date.now()}-${Math.random()}`);
    const installer = await getUser(`installer-${Math.random()}`, owner.teamId);
    const otherInstaller = await getUser(`installer2-${Math.random()}`, owner.teamId);
    const plain = await getUser(`plain-${Math.random()}`, owner.teamId);
    await grantInstallModel(installer);
    await grantInstallModel(otherInstaller);
    return { owner, installer, otherInstaller, plain };
  };

  it('returns the created channel identity and applies defaults through the API', async () => {
    const { installer, otherInstaller } = await createMembers();
    const body = {
      channelType: 'team',
      name: '  created-channel  ',
      type: 1,
      key: 'sk-new',
      models: [],
      configs: { custom: 'kept' }
    };
    const first = await Call(channelCreateHandler, { auth: installer, body });
    expect(first.code).toBe(200);
    expect(first.data).toEqual({ id: 1 });
    const groupId = `fastgpt:tmb:${installer.tmbId}`;
    expect(bucketOf(groupId)[0]).toMatchObject({
      name: 'created-channel',
      configs: { map_reasoning_to_reasoning_content: true, custom: 'kept' }
    });
    const second = await Call(channelCreateHandler, { auth: otherInstaller, body });
    expect(second.code).toBe(200);
    expect(second.data).toEqual({ id: 1 });
    expect(requests.every(({ url }) => url.startsWith(`/api/group/`))).toBe(true);
  });

  describe('install-model permission', () => {
    it('lets a member holding the permission create, list and delete own models', async () => {
      const { installer } = await createMembers();

      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('team-model-a'), channelType: 'team' }
      });
      expect(created.code).toBe(200);

      const config = await Call(modelConfigHandler, {
        auth: installer,
        query: { channelType: 'team' }
      });
      expect(config.code).toBe(200);
      expect(config.data.models.map((item: { model: string }) => item.model)).toEqual([
        'team-model-a'
      ]);

      const removed = await Call(deleteHandler, {
        auth: installer,
        body: { modelIds: [created.data.modelId], channelType: 'team' }
      });
      expect(removed.code).toBe(200);
      expect(await MongoAIModel.countDocuments({ model: 'team-model-a' })).toBe(0);
    });

    it('rejects every management read and write for a member without the permission', async () => {
      const { installer, plain } = await createMembers();
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('guarded-model'), channelType: 'team' }
      });
      expect(created.code).toBe(200);
      const before = await MongoAIModel.find({}).lean();

      const responses = await Promise.all([
        Call(createHandler, {
          auth: plain,
          body: { modelData: modelDraft('plain-model'), channelType: 'team' }
        }),
        Call(deleteHandler, {
          auth: plain,
          body: { modelIds: [created.data.modelId], channelType: 'team' }
        }),
        Call(updateChannelsHandler, {
          auth: plain,
          body: { modelId: created.data.modelId, channelType: 'team', addChannelIds: [1] }
        }),
        Call(createFromTemplatesHandler, {
          auth: plain,
          body: { templates: [{ type: ModelTypeEnum.llm, model: 'tpl' }], channelType: 'team' }
        }),
        Call(templatesHandler, { auth: plain, query: { channelType: 'team' } }),
        Call(modelConfigHandler, { auth: plain, query: { channelType: 'team' } }),
        Call(channelListHandler, { auth: plain, query: { channelType: 'team' } }),
        Call(channelLogsHandler, {
          auth: plain,
          query: {
            channelType: 'team',
            startTimestamp: 1787500800000,
            endTimestamp: 1787673599999,
            pageSize: 20
          }
        })
      ]);

      for (const response of responses) {
        expect(response.code).toBe(500);
        expect(['unAuthModel', 'unAuthChannel']).toContain(response.error);
      }
      // 被拒绝的请求不得改动模型数据，也不得触达 AI Proxy
      expect(await MongoAIModel.find({}).lean()).toEqual(before);
      expect(requests).toEqual([]);
    });

    it('rejects a member who cannot reach system scope', async () => {
      const { installer } = await createMembers();

      const response = await Call(modelConfigHandler, {
        auth: installer,
        query: { channelType: 'system' }
      });

      expect(response.code).toBe(500);
      expect(response.error).toBe('rootOnlyPermit');
    });

    it('rejects team scope entirely on the open-source edition', async () => {
      const { installer } = await createMembers();
      global.feConfigs = { isPlus: false } as typeof global.feConfigs;

      const responses = await Promise.all([
        Call(createHandler, {
          auth: installer,
          body: { modelData: modelDraft('oss-model'), channelType: 'team' }
        }),
        Call(modelConfigHandler, { auth: installer, query: { channelType: 'team' } }),
        Call(templatesHandler, { auth: installer, query: { channelType: 'team' } })
      ]);

      for (const response of responses) {
        expect(response.code).toBe(500);
        expect(response.error).toBe('commercialFeature');
      }
      expect(await MongoAIModel.countDocuments({})).toBe(0);
    });
  });

  describe('templates for members', () => {
    it('serves templates to a member with the permission and creates a team-owned model', async () => {
      const { installer } = await createMembers();
      external.listModels.mockResolvedValue([modelDraft('tpl-a'), modelDraft('tpl-b')]);

      const templates = await Call(templatesHandler, {
        auth: installer,
        query: { channelType: 'team' }
      });
      expect(templates.code).toBe(200);
      expect(templates.data.models.map((item: { model: string }) => item.model)).toEqual([
        'tpl-a',
        'tpl-b'
      ]);

      const created = await Call(createFromTemplatesHandler, {
        auth: installer,
        body: { templates: [{ type: ModelTypeEnum.llm, model: 'tpl-a' }], channelType: 'team' }
      });
      expect(created.code).toBe(200);
      expect(created.data.models).toHaveLength(1);
      expect(await MongoAIModel.findOne({ model: 'tpl-a' }).lean()).toMatchObject({
        scope: ModelScopeEnum.team,
        tmbId: expect.anything(),
        teamId: expect.anything()
      });
    });

    it('associates channels when batch creating models from templates', async () => {
      const { installer } = await createMembers();
      external.listModels.mockResolvedValue([modelDraft('tpl-a'), modelDraft('tpl-b')]);
      const groupId = `fastgpt:tmb:${installer.tmbId}`;
      const channel = addChannel(groupId, { id: 101, name: 'ch-template', models: ['existing'] });

      const created = await Call(createFromTemplatesHandler, {
        auth: installer,
        body: {
          templates: [
            { type: ModelTypeEnum.llm, model: 'tpl-a' },
            { type: ModelTypeEnum.llm, model: 'tpl-b' }
          ],
          channelType: 'team',
          channelIds: [channel.id]
        }
      });
      expect(created.code).toBe(200);
      expect(created.data.models).toHaveLength(2);
      expect(channel.models).toEqual(['existing', 'tpl-a', 'tpl-b']);
    });

    it('does not let a member without the permission read the system templates', async () => {
      const { plain } = await createMembers();
      external.listModels.mockResolvedValue([modelDraft('tpl-secret')]);

      const response = await Call(templatesHandler, {
        auth: plain,
        query: { channelType: 'team' }
      });

      expect(response.code).toBe(500);
      expect(response.error).toBe('unAuthModel');
    });

    it('keeps system templates root-only when the scope is system', async () => {
      const { installer } = await createMembers();

      const memberRes = await Call(templatesHandler, {
        auth: installer,
        query: { channelType: 'system' }
      });
      expect(memberRes.error).toBe('rootOnlyPermit');

      const root = await getRootUser();
      external.listModels.mockResolvedValue([modelDraft('tpl-a')]);
      const rootRes = await Call(templatesHandler, {
        auth: root,
        query: { channelType: 'system' }
      });
      expect(rootRes.code).toBe(200);
      expect(rootRes.data.models).toHaveLength(1);
    });
  });

  describe('member isolation', () => {
    it('keeps models and channels of different members invisible to each other', async () => {
      const { installer, otherInstaller } = await createMembers();
      const groupA = `fastgpt:tmb:${installer.tmbId}`;
      const groupB = `fastgpt:tmb:${otherInstaller.tmbId}`;
      addChannel(groupA, { id: 11, name: 'A channel', models: ['model-a'] });
      addChannel(groupB, { id: 21, name: 'B channel', models: ['model-b'] });
      await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-a'), channelType: 'team' }
      });
      await Call(createHandler, {
        auth: otherInstaller,
        body: { modelData: modelDraft('model-b'), channelType: 'team' }
      });

      const configA = await Call(modelConfigHandler, {
        auth: installer,
        query: { channelType: 'team' }
      });
      const listA = await Call(channelListHandler, {
        auth: installer,
        query: { channelType: 'team' }
      });

      expect(configA.data.models.map((item: { model: string }) => item.model)).toEqual(['model-a']);
      expect(listA.data.list.map((item: { name: string }) => item.name)).toEqual(['A channel']);
      // 成员 A 的请求只访问自己的分组，从不触达成员 B 的分组
      expect(requests.every((item) => !item.url.includes(encodeURIComponent(groupB)))).toBe(true);
    });

    it('cannot bind to or remove channels owned by another member', async () => {
      const { installer, otherInstaller } = await createMembers();
      const groupB = `fastgpt:tmb:${otherInstaller.tmbId}`;
      const foreign = addChannel(groupB, { id: 31, name: 'B channel', models: ['model-b'] });
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-a'), channelType: 'team' }
      });

      const bind = await Call(updateChannelsHandler, {
        auth: installer,
        body: { modelId: created.data.modelId, channelType: 'team', addChannelIds: [31] }
      });
      const unbind = await Call(updateChannelsHandler, {
        auth: installer,
        body: { modelId: created.data.modelId, channelType: 'team', removeChannelIds: [31] }
      });

      expect(bind.error).toBe('channelNotExist');
      expect(unbind.error).toBe('channelNotExist');
      expect(foreign.models).toEqual(['model-b']);
    });

    it("cannot operate on another member's model, even as root", async () => {
      const { installer, otherInstaller } = await createMembers();
      const root = await getRootUser();
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-a'), channelType: 'team' }
      });

      const responses = await Promise.all([
        Call(updateChannelsHandler, {
          auth: otherInstaller,
          body: { modelId: created.data.modelId, channelType: 'team', addChannelIds: [1] }
        }),
        Call(updateChannelsHandler, {
          auth: root,
          body: { modelId: created.data.modelId, channelType: 'team', addChannelIds: [1] }
        }),
        Call(deleteHandler, {
          auth: otherInstaller,
          body: { modelIds: [created.data.modelId], channelType: 'team' }
        })
      ]);

      for (const response of responses) {
        expect(response.code).toBe(500);
        expect(typeof response.error === 'string' ? response.error : response.error.message).toBe(
          'modelUnExist'
        );
      }
      expect(await MongoAIModel.countDocuments({ model: 'model-a' })).toBe(1);
    });

    it('does not let a member reach system models through the team scope', async () => {
      const { installer } = await createMembers();
      const root = await getRootUser();
      const system = await Call(createHandler, {
        auth: root,
        body: {
          modelData: { ...modelDraft('system-model'), scope: ModelScopeEnum.system },
          channelType: 'system'
        }
      });
      expect(system.code).toBe(200);

      const responses = await Promise.all([
        Call(deleteHandler, {
          auth: installer,
          body: { modelIds: [system.data.modelId], channelType: 'team' }
        }),
        Call(updateChannelsHandler, {
          auth: installer,
          body: { modelId: system.data.modelId, channelType: 'team', addChannelIds: [1] }
        })
      ]);

      for (const response of responses) {
        expect(response.code).toBe(500);
        expect(typeof response.error === 'string' ? response.error : response.error.message).toBe(
          'modelUnExist'
        );
      }
      expect(await MongoAIModel.countDocuments({ model: 'system-model' })).toBe(1);
    });
  });

  describe('channel association synced by the server', () => {
    it('binds an existing channel without clearing its API key or other settings', async () => {
      const { installer } = await createMembers();
      const group = `fastgpt:tmb:${installer.tmbId}`;
      const channel = addChannel(group, {
        id: 41,
        name: 'keep-me',
        models: ['other-model'],
        priority: 7
      });
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-a'), channelType: 'team' }
      });

      const bound = await Call(updateChannelsHandler, {
        auth: installer,
        body: { modelId: created.data.modelId, channelType: 'team', addChannelIds: [41] }
      });
      expect(bound.code).toBe(200);
      // 重复绑定幂等，不产生重复的模型名
      await Call(updateChannelsHandler, {
        auth: installer,
        body: { modelId: created.data.modelId, channelType: 'team', addChannelIds: [41] }
      });

      expect(channel.models).toEqual(['other-model', 'model-a']);
      // AI Proxy 为 patch 语义：原有 key、名称、优先级在更新 models 时保持不变
      expect(channel).toMatchObject({ key: 'sk-secret-41', name: 'keep-me', priority: 7 });
    });

    it('unbinds only the model mapping and keeps the channel and other models', async () => {
      const { installer } = await createMembers();
      const group = `fastgpt:tmb:${installer.tmbId}`;
      const channel = addChannel(group, {
        id: 51,
        name: 'shared-channel',
        models: ['model-a', 'model-keep'],
        model_mapping: { 'model-a': 'upstream-a', 'model-keep': 'upstream-keep' }
      });
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-a'), channelType: 'team' }
      });

      const unbound = await Call(updateChannelsHandler, {
        auth: installer,
        body: { modelId: created.data.modelId, channelType: 'team', removeChannelIds: [51] }
      });

      expect(unbound.code).toBe(200);
      expect(channel.models).toEqual(['model-keep']);
      expect(channel.model_mapping).toEqual({ 'model-keep': 'upstream-keep' });
      expect(channel.key).toBe('sk-secret-51');
      expect(await MongoAIModel.countDocuments({ model: 'model-a' })).toBe(1);
    });

    it('associates channels chosen at creation time on the server', async () => {
      const { installer } = await createMembers();
      const group = `fastgpt:tmb:${installer.tmbId}`;
      const channel = addChannel(group, { id: 61, name: 'quick-bind', models: [] });

      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-a'), channelType: 'team', channelIds: [61] }
      });

      expect(created.code).toBe(200);
      expect(channel.models).toEqual(['model-a']);
    });
  });

  describe('deleting a model cleans up its channel mappings', () => {
    it('removes the model from every channel of the owner while keeping other mappings', async () => {
      const { installer, otherInstaller } = await createMembers();
      const group = `fastgpt:tmb:${installer.tmbId}`;
      const first = addChannel(group, {
        id: 71,
        name: 'c1',
        models: ['model-m', 'model-m2'],
        model_mapping: { 'model-m': 'up-m', 'model-m2': 'up-m2' }
      });
      const second = addChannel(group, {
        id: 72,
        name: 'c2',
        models: ['model-m', 'model-m2']
      });
      const unrelated = addChannel(group, { id: 73, name: 'c3', models: ['model-m2'] });
      // 另一个成员的渠道即使有同名模型也不能被清理
      const foreign = addChannel(`fastgpt:tmb:${otherInstaller.tmbId}`, {
        id: 81,
        name: 'foreign',
        models: ['model-m']
      });
      const deleting = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-m'), channelType: 'team' }
      });
      await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-m2'), channelType: 'team' }
      });

      const removed = await Call(deleteHandler, {
        auth: installer,
        body: { modelIds: [deleting.data.modelId], channelType: 'team' }
      });

      expect(removed.code).toBe(200);
      expect(first.models).toEqual(['model-m2']);
      expect(first.model_mapping).toEqual({ 'model-m2': 'up-m2' });
      expect(second.models).toEqual(['model-m2']);
      expect(unrelated.models).toEqual(['model-m2']);
      expect(foreign.models).toEqual(['model-m']);
      // 渠道本身都还在，保留的模型仍然可用
      expect(bucketOf(group).map((item) => item.id)).toEqual([71, 72, 73]);
      expect(await MongoAIModel.countDocuments({ model: 'model-m' })).toBe(0);
      expect(await MongoAIModel.countDocuments({ model: 'model-m2' })).toBe(1);
    });

    it('still succeeds when the member has no AI Proxy bucket yet', async () => {
      const { installer } = await createMembers();
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('lonely-model'), channelType: 'team' }
      });

      const removed = await Call(deleteHandler, {
        auth: installer,
        body: { modelIds: [created.data.modelId], channelType: 'team' }
      });

      expect(removed.code).toBe(200);
      expect(await MongoAIModel.countDocuments({ model: 'lonely-model' })).toBe(0);
    });

    it('keeps the deletion committed when the channel cleanup fails', async () => {
      const { installer } = await createMembers();
      const group = `fastgpt:tmb:${installer.tmbId}`;
      addChannel(group, { id: 91, name: 'fragile', models: ['model-m'] });
      const created = await Call(createHandler, {
        auth: installer,
        body: { modelData: modelDraft('model-m'), channelType: 'team' }
      });
      // 让 AI Proxy 之后的所有请求失败，模拟渠道清理阶段不可用
      const originalBase = external.baseUrl;
      external.baseUrl = 'http://127.0.0.1:1';

      try {
        const removed = await Call(deleteHandler, {
          auth: installer,
          body: { modelIds: [created.data.modelId], channelType: 'team' }
        });
        // 清理是副作用：失败只记日志，模型删除已提交，前端重试不会因模型不存在而卡住
        expect(removed.code).toBe(200);
      } finally {
        external.baseUrl = originalBase;
      }
      expect(await MongoAIModel.countDocuments({ model: 'model-m' })).toBe(0);
    });
  });
});
