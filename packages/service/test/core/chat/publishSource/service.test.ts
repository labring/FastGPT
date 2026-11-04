import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import {
  extendChatPublishSources,
  updateChatPublishSource
} from '@fastgpt/service/core/chat/publishSource/service';
import {
  buildChatPublishSourceFilter,
  buildSharePublishSourceFilter
} from '@fastgpt/service/core/chat/publishSource/utils';

const oid = () => new Types.ObjectId().toString();
let scope: { teamId: string; tmbId: string; sourceId: string; sourceType: ChatSourceTypeEnum };
const chatId = 'publish-source-test';

beforeEach(() => {
  scope = { teamId: oid(), tmbId: oid(), sourceId: oid(), sourceType: ChatSourceTypeEnum.app };
});

describe('updateChatPublishSource', () => {
  it('创建并整体替换最新来源，内部入口清除旧渠道和名称', async () => {
    const id = oid();
    await updateChatPublishSource({
      ...scope,
      chatId,
      source: 'api',
      publishSource: { type: ChatSourceEnum.api, id },
      sourceName: '后台',
      outLinkUid: 'customer'
    });
    let chat = await MongoChat.findOne({ chatId }).lean();
    expect(String(chat?.publishSource?.id)).toBe(id);
    expect(chat?.sourceName).toBe('后台');
    expect(chat?.publishSource).not.toHaveProperty('_id');
    await updateChatPublishSource({ ...scope, chatId, source: 'online' });
    chat = await MongoChat.findOne({ chatId }).lean();
    expect(chat?.publishSource).toEqual({ type: 'online' });
    expect(chat).not.toHaveProperty('sourceName');
    expect(chat).not.toHaveProperty('shareId');
    expect(chat).not.toHaveProperty('outLinkUid');
  });

  it('分享渠道只按新来源比较，缺字段忽略旧 shareId 但仍校验 UID', async () => {
    const id = oid();
    const params = {
      ...scope,
      chatId,
      source: 'share',
      shareId: 'public',
      outLinkUid: 'u1',
      publishSource: { type: ChatSourceEnum.share, id }
    };
    await MongoChat.create({
      ...scope,
      appId: scope.sourceId,
      chatId,
      source: 'share',
      shareId: 'legacy-other-channel',
      outLinkUid: 'u1'
    });
    await expect(updateChatPublishSource({ ...params, outLinkUid: 'u2' })).rejects.toBe(
      ChatErrEnum.unAuthChat
    );
    await updateChatPublishSource(params);
    const migrated = await MongoChat.findOne({ chatId }).lean();
    expect(migrated?.shareId).toBe('public');
    expect(String(migrated?.publishSource?.id)).toBe(id);
    await expect(updateChatPublishSource({ ...params, outLinkUid: 'u2' })).rejects.toBe(
      ChatErrEnum.unAuthChat
    );
    await expect(
      updateChatPublishSource({
        ...params,
        publishSource: { type: ChatSourceEnum.share, id: oid() }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    await updateChatPublishSource({
      ...scope,
      chatId,
      source: 'api',
      publishSource: { type: ChatSourceEnum.api, id: oid() }
    });
    await expect(updateChatPublishSource(params)).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it.each([
    ['same', 'mcp', true, true],
    ['other-key', 'mcp', true, false],
    ['other-type', 'api', true, false],
    ['missing-id', 'mcp', false, true],
    ['missing-type', undefined, true, true],
    ['missing-source', undefined, false, true]
  ] as const)('MCP 已有会话来源边界：%s', async (name, type, hasId, allowed) => {
    const id = oid();
    const previous = {
      ...(type ? { type } : {}),
      ...(hasId ? { id: new Types.ObjectId(name === 'other-key' ? oid() : id) } : {})
    };
    await MongoChat.collection.insertOne({
      appId: new Types.ObjectId(scope.sourceId),
      sourceType: scope.sourceType,
      teamId: new Types.ObjectId(scope.teamId),
      tmbId: new Types.ObjectId(scope.tmbId),
      chatId,
      source: 'mcp',
      ...(name === 'missing-source' ? {} : { publishSource: previous })
    });
    const call = () =>
      updateChatPublishSource({
        ...scope,
        chatId,
        source: 'mcp',
        publishSource: { type: ChatSourceEnum.mcp, id }
      });
    if (allowed) {
      await call();
      expect(String((await MongoChat.findOne({ chatId }).lean())?.publishSource?.id)).toBe(id);
    } else {
      await expect(call()).rejects.toBe(ChatErrEnum.unAuthChat);
      expect((await MongoChat.findOne({ chatId }).lean())?.publishSource).toEqual(previous);
    }
  });

  it('拒绝跨团队记录，不按未命中更新创建新会话', async () => {
    await updateChatPublishSource({ ...scope, chatId, source: 'online' });
    await expect(
      updateChatPublishSource({ ...scope, teamId: oid(), chatId, source: 'online' })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    expect(await MongoChat.countDocuments({ chatId })).toBe(1);
  });

  it('来源快照条件未命中时重读，重试耗尽后保持原来源', async () => {
    const id = oid();
    const params = {
      ...scope,
      chatId,
      source: 'mcp',
      publishSource: { type: ChatSourceEnum.mcp, id }
    };
    await updateChatPublishSource(params);
    const write = vi.spyOn(MongoChat, 'updateOne').mockResolvedValue({ matchedCount: 0 } as any);
    try {
      await expect(updateChatPublishSource(params)).rejects.toBe(ChatErrEnum.unAuthChat);
      expect(write).toHaveBeenCalledTimes(3);
      expect(write.mock.calls[0][0]).toMatchObject({
        'publishSource.type': ChatSourceEnum.mcp,
        'publishSource.id': expect.anything()
      });
      expect(String((await MongoChat.findOne({ chatId }).lean())?.publishSource?.id)).toBe(id);
    } finally {
      write.mockRestore();
    }
  });

  it('创建唯一键竞争后重读，并透传非唯一键的存储错误', async () => {
    await updateChatPublishSource({ ...scope, chatId, source: 'online' });
    const find = vi.spyOn(MongoChat, 'findOne');
    const first = MongoChat.findOne({ _id: oid() });
    find.mockReturnValueOnce(first);
    await updateChatPublishSource({ ...scope, chatId, source: 'test' });
    find.mockRestore();
    const error = new Error('write failed');
    const create = vi.spyOn(MongoChat, 'create').mockRejectedValueOnce(error);
    try {
      await expect(
        updateChatPublishSource({ ...scope, chatId: 'new-failed', source: 'online' })
      ).rejects.toBe(error);
    } finally {
      create.mockRestore();
    }
  });
});

describe('extendChatPublishSources', () => {
  it('按渠道批量关联当前名称，遵守团队和资源归属并兼容旧名', async () => {
    const key = await MongoOpenApi.create({
      teamId: scope.teamId,
      tmbId: scope.tmbId,
      apiKey: 'test-credential',
      name: '改名后的后台',
      appId: oid()
    });
    const foreign = await MongoOpenApi.create({
      teamId: oid(),
      tmbId: oid(),
      apiKey: 'foreign-credential',
      name: '不可泄漏'
    });
    const mcp = await MongoMcpKey.create({
      teamId: scope.teamId,
      tmbId: scope.tmbId,
      name: '工具',
      apps: [{ appId: scope.sourceId, toolName: 'probe', description: 'probe' }]
    });
    const share = await MongoOutLink.create({
      teamId: scope.teamId,
      tmbId: scope.tmbId,
      appId: scope.sourceId,
      type: 'share',
      shareId: 'public',
      name: '官网'
    });
    const list = [
      { publishSource: { type: ChatSourceEnum.api, id: String(key._id) }, sourceName: '旧后台' },
      { publishSource: { type: ChatSourceEnum.mcp, id: String(mcp._id) } },
      { publishSource: { type: ChatSourceEnum.share, id: String(share._id) } },
      {
        publishSource: { type: ChatSourceEnum.api, id: String(foreign._id) },
        sourceName: '历史名'
      },
      { publishSource: { type: ChatSourceEnum.api, id: oid() }, sourceName: ' ' },
      { sourceName: ' 旧接口名 ' },
      {}
    ];
    const rows = await extendChatPublishSources({
      list,
      teamId: scope.teamId,
      appId: scope.sourceId
    });
    expect(rows.map((r) => r.publishSource?.name)).toEqual([
      '改名后的后台',
      '工具',
      '官网',
      '历史名',
      undefined,
      '旧接口名',
      undefined
    ]);
    expect(rows[5].publishSource).toEqual({ name: '旧接口名' });
    expect(JSON.stringify(rows)).not.toContain('credential');
    const otherApp = await extendChatPublishSources({ list, teamId: scope.teamId, appId: oid() });
    expect(otherApp[0].publishSource?.name).toBe('改名后的后台');
    expect(otherApp[1].publishSource?.name).toBeUndefined();
    expect(otherApp[2].publishSource?.name).toBeUndefined();
    expect(
      await extendChatPublishSources({ list: [], teamId: scope.teamId, appId: scope.sourceId })
    ).toEqual([]);
  });
});

describe('来源查询兼容的 Mongo 语义', () => {
  it('新来源优先，缺字段回退旧值；省略筛选不过滤，空数组不返回记录', async () => {
    const id = new Types.ObjectId();
    const base = {
      teamId: new Types.ObjectId(scope.teamId),
      tmbId: new Types.ObjectId(scope.tmbId),
      appId: new Types.ObjectId(scope.sourceId),
      sourceType: scope.sourceType,
      source: 'api',
      shareId: 'public',
      outLinkUid: 'u1'
    };
    // 原生写入用于保留旧记录缺 type / null 的真实形态，不经过当前 Schema 修正。
    const records = [
      { chatId: 'new-share', publishSource: { type: 'share', id } },
      { chatId: 'legacy-api' },
      { chatId: 'legacy-share', source: 'share' },
      { chatId: 'type-only', publishSource: { type: 'share' } },
      { chatId: 'id-only', source: 'share', publishSource: { id } },
      { chatId: 'null-source', source: 'share', publishSource: null },
      { chatId: 'other-share', publishSource: { type: 'share', id: new Types.ObjectId() } },
      { chatId: 'new-api', source: 'share', publishSource: { type: 'api', id } },
      { chatId: 'other-legacy', source: 'share', shareId: 'other' }
    ];
    await MongoChat.collection.insertMany(records.map((record) => ({ ...base, ...record })));
    expect(
      (await MongoChat.find(buildChatPublishSourceFilter(['share'])).lean())
        .map((c) => c.chatId)
        .sort()
    ).toEqual([
      'id-only',
      'legacy-share',
      'new-share',
      'null-source',
      'other-legacy',
      'other-share',
      'type-only'
    ]);
    expect(
      (
        await MongoChat.find(
          buildSharePublishSourceFilter({ id: String(id), shareId: 'public' })
        ).lean()
      )
        .map((c) => c.chatId)
        .sort()
    ).toEqual(['id-only', 'legacy-api', 'legacy-share', 'new-share', 'null-source', 'type-only']);
    expect(await MongoChat.countDocuments(buildChatPublishSourceFilter())).toBe(records.length);
    expect(await MongoChat.countDocuments(buildChatPublishSourceFilter([]))).toBe(0);
  });
});
