import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { backfillChatPublishSource } from '@/migration/tasks/4180/20261104_backfill_chat_publish_source';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  SystemMigrationProgressInputSchema,
  type SystemMigrationFailedRecord,
  type SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));

const oid = () => new Types.ObjectId();
/** 仅模拟升级框架的持久恢复状态；业务记录读写使用真实隔离 Mongo。 */
const createContext = (
  initialCheckpoint?: Record<string, unknown>,
  initialFailures: SystemMigrationFailedRecord[] = []
) => {
  let checkpoint = initialCheckpoint;
  let failures = structuredClone(initialFailures);
  const context = {
    migrationId: '20261104_backfill_chat_publish_source',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async (progress) => {
      SystemMigrationProgressInputSchema.parse(progress);
    }),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, failures: () => failures, checkpoint: () => checkpoint };
};

const seed = async (overrides: Record<string, unknown> = {}) => {
  const record = {
    _id: oid(),
    teamId: oid(),
    appId: oid(),
    source: 'api',
    sourceName: '历史入口',
    ...overrides
  };
  await MongoChat.collection.insertOne(record as any);
  return record;
};

afterEach(() => vi.restoreAllMocks());

describe('backfillChatPublishSource', () => {
  it('从两库已扫描断点重试来源枚举错误，未知来源通过完成校验且不计为渠道 ID 缺失', async () => {
    const chat = await seed({ source: '1111', shareId: 'legacy-share' });
    const log = { _id: oid(), teamId: oid(), appId: oid(), source: '网页读取', totalPoints: 4 };
    await MongoAppChatLog.collection.insertOne(log as any);
    const cursors = {
      chats: { endId: String(chat._id), lastId: String(chat._id), scanned: 1, total: 1 },
      chatLogs: { endId: String(log._id), lastId: String(log._id), scanned: 1 }
    };
    const { context, failures, checkpoint } = createContext(cursors, [
      { stageKey: 'chats', data: { id: String(chat._id) }, reason: { message: 'Invalid source' } },
      { stageKey: 'chatLogs', data: { id: String(log._id) }, reason: { message: 'Invalid source' } }
    ]);

    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await backfillChatPublishSource(context)).toEqual({
        chats: 1,
        chatLogs: 1,
        missingChannelIds: 0
      });
      expect(failures()).toEqual([]);
      expect(checkpoint()).toEqual(cursors);
      expect(await MongoChat.collection.findOne({ _id: chat._id })).toEqual({
        ...chat,
        publishSource: { type: 'unknown' }
      });
      expect(await MongoAppChatLog.collection.findOne({ _id: log._id })).toEqual({
        ...log,
        publishSource: { type: 'unknown' }
      });
    }
    expect(context.reportProgress).toHaveBeenCalledWith({ key: 'validation', status: 'succeeded' });
  });

  it('从已扫描断点重试旧资源类型错误，无需修改旧数据或重置进度', async () => {
    const records = [];
    for (const sourceType of [null, '', 'legacy-resource']) {
      records.push(await seed({ sourceType }));
    }
    const endId = String(records.at(-1)!._id);
    const { context, failures } = createContext(
      {
        chats: { endId, lastId: endId, scanned: 3, total: 3 },
        chatLogs: { endId: null, lastId: null, scanned: 0 }
      },
      records.map((record) => ({
        stageKey: 'chats',
        data: { id: String(record._id) },
        reason: { message: 'Invalid legacy sourceType' }
      }))
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await backfillChatPublishSource(context)).toEqual({
        chats: 3,
        chatLogs: 0,
        missingChannelIds: 3
      });
      expect(failures()).toEqual([]);
      for (const record of records) {
        expect(await MongoChat.collection.findOne({ _id: record._id })).toEqual({
          ...record,
          publishSource: { type: 'api' }
        });
      }
    }
  });

  it('回填可靠外链引用，API/MCP 仅保留分类，统计桶使用自身来源且数值不变', async () => {
    const teamId = oid(),
      appId = oid();
    const channel = await MongoOutLink.create({
      teamId,
      appId,
      tmbId: oid(),
      type: 'share',
      shareId: 'public',
      name: '官网'
    });
    const shared = await seed({ teamId, appId, source: 'share', shareId: 'public' });
    const api = await seed();
    const mcp = await seed({ source: 'mcp' });
    const online = await seed({ source: 'online', shareId: 'public' });
    const deleted = await seed({ source: 'share', shareId: 'deleted' });
    const existing = await seed({ publishSource: { type: 'api' }, shareId: 'stale' });
    const logId = oid();
    await MongoAppChatLog.collection.insertOne({
      _id: logId,
      teamId,
      appId,
      source: 'share',
      sourceName: '历史桶',
      chatId: 'history-bucket',
      userId: 'customer',
      chatItemCount: 3,
      totalPoints: 4
    } as any);
    const beforeChats = await MongoChat.collection.find({}).toArray();
    const { context } = createContext();
    const chatWrites = vi.spyOn(MongoChat.collection, 'bulkWrite');
    const logWrites = vi.spyOn(MongoAppChatLog.collection, 'bulkWrite');
    expect(await backfillChatPublishSource(context)).toEqual({
      chats: 6,
      chatLogs: 1,
      missingChannelIds: 5
    });
    expect(chatWrites).toHaveBeenCalledTimes(3);
    expect(logWrites).toHaveBeenCalledTimes(1);
    chatWrites.mockRestore();
    logWrites.mockRestore();
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'chats',
      status: 'running',
      current: 0,
      total: 6
    });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'chats',
      status: 'succeeded',
      current: 6,
      total: 6
    });
    for (const [progress] of context.reportProgress.mock.calls) {
      if (progress.key === 'chatLogs') expect(progress).not.toHaveProperty('total');
    }
    const read = (id: Types.ObjectId) => MongoChat.collection.findOne({ _id: id });
    expect(String((await read(shared._id))?.publishSource.id)).toBe(String(channel._id));
    expect((await read(api._id))?.publishSource).toEqual({ type: 'api' });
    expect((await read(mcp._id))?.publishSource).toEqual({ type: 'mcp' });
    expect((await read(online._id))?.publishSource).toEqual({ type: 'online' });
    expect((await read(deleted._id))?.publishSource).toEqual({ type: 'share' });
    expect((await read(existing._id))?.publishSource).toEqual({ type: 'api' });
    expect((await read(shared._id))?.sourceName).toBe('历史入口');
    for (const before of beforeChats) {
      const after = await read(before._id);
      expect({ ...after, publishSource: undefined }).toEqual({
        ...before,
        publishSource: undefined
      });
    }
    expect((await MongoOutLink.findById(channel._id).lean())?.shareId).toBe('public');
    expect(await MongoAppChatLog.collection.findOne({ _id: logId })).toMatchObject({
      publishSource: { type: 'share' },
      sourceName: '历史桶',
      chatItemCount: 3,
      totalPoints: 4
    });
    expect(await backfillChatPublishSource(context)).toEqual({
      chats: 6,
      chatLogs: 1,
      missingChannelIds: 5
    });
  });

  it('补算旧断点时保留已处理数量，按原上界统计剩余对话，续跑不重复计数', async () => {
    const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'));
    await seed({ _id: id(1), publishSource: { type: 'api' } });
    await seed({ _id: id(3) });
    await seed({ _id: id(4) });
    await seed({ _id: id(5) });
    const count = vi.spyOn(MongoChat.collection, 'countDocuments');
    const { context, checkpoint } = createContext({
      chats: { endId: String(id(4)), lastId: String(id(2)), scanned: 2 },
      chatLogs: { endId: null, lastId: null, scanned: 0 }
    });

    expect(await backfillChatPublishSource(context)).toMatchObject({ chats: 4, chatLogs: 0 });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'chats',
      status: 'running',
      current: 2,
      total: 4
    });
    expect(checkpoint()).toMatchObject({ chats: { total: 4, lastId: String(id(4)) } });
    expect((await MongoChat.collection.findOne({ _id: id(5) }))?.publishSource).toBeUndefined();

    await backfillChatPublishSource(context);
    // 只有补算进度时使用纯 _id 范围计数；完成校验的计数均带有来源条件。
    expect(
      count.mock.calls.filter(([filter]) => Object.keys(filter ?? {}).length === 1)
    ).toHaveLength(1);
  });

  it.each(['delete', 'insert'] as const)(
    '扫描期间%s对话时保持进度范围合法，并在耗尽游标后校准总量',
    async (change) => {
      const id = (n: number) => new Types.ObjectId(n.toString(16).padStart(24, '0'));
      for (const n of [1, 2, 4, 5]) await seed({ _id: id(n) });
      const { context, checkpoint } = createContext();
      context.reportProgress.mockImplementation(async (progress) => {
        SystemMigrationProgressInputSchema.parse(progress);
        if (progress.key === 'chats' && progress.status === 'running' && progress.current === 2) {
          if (change === 'delete') {
            await MongoChat.collection.deleteOne({ _id: id(4) });
          } else {
            await seed({ _id: id(3) });
          }
        }
      });

      const total = change === 'insert' ? 5 : 3;
      expect(await backfillChatPublishSource(context)).toMatchObject({ chats: total, chatLogs: 0 });
      expect(context.reportProgress).toHaveBeenCalledWith({
        key: 'chats',
        status: 'running',
        current: 0,
        total: 4
      });
      expect(context.reportProgress).toHaveBeenCalledWith({
        key: 'chats',
        status: 'succeeded',
        current: total,
        total
      });
      expect(checkpoint()).toMatchObject({ chats: { total } });
    }
  );

  it('空对话集合上报 0/0，统计桶不补充 total', async () => {
    const { context, checkpoint } = createContext();
    expect(await backfillChatPublishSource(context)).toEqual({
      chats: 0,
      chatLogs: 0,
      missingChannelIds: 0
    });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'chats',
      status: 'succeeded',
      current: 0,
      total: 0
    });
    expect(checkpoint()).toMatchObject({ chats: { total: 0 } });
    expect(checkpoint()?.chatLogs).not.toHaveProperty('total');
  });

  it('提交后、checkpoint 前中断可重放，扫描和计数不重复', async () => {
    await seed({ shareId: 'stale' });
    await seed({ shareId: 'stale' });
    await seed({ shareId: 'stale' });
    const { context } = createContext();
    const save = context.saveCheckpoint.getMockImplementation()!;
    context.saveCheckpoint.mockImplementationOnce(save).mockRejectedValueOnce(new Error('crash'));
    await expect(backfillChatPublishSource(context)).rejects.toThrow('crash');
    expect(await MongoChat.countDocuments({ 'publishSource.type': 'api' })).toBe(2);
    context.saveCheckpoint.mockImplementation(save);
    const result = await backfillChatPublishSource(context);
    expect(result).toEqual({ chats: 3, chatLogs: 0, missingChannelIds: 3 });
    expect(await MongoChat.countDocuments({})).toBe(3);
    expect(await MongoChat.collection.countDocuments({ shareId: 'stale' })).toBe(3);
  });

  it('错误快照在断点前保存，重试优先修复已跳过记录', async () => {
    const bad = await seed({ teamId: null, shareId: 'keep-until-repaired' });
    await seed();
    const state = createContext();
    await expect(backfillChatPublishSource(state.context)).rejects.toThrow('require repair');
    expect((await MongoChat.collection.findOne({ _id: bad._id }))?.shareId).toBe(
      'keep-until-repaired'
    );
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'chats', data: { id: String(bad._id) } })
    ]);
    const checkpointOrder = state.context.saveCheckpoint.mock.invocationCallOrder.at(-1)!;
    expect(
      state.context.reportFailedRecords.mock.invocationCallOrder.some((n) => n < checkpointOrder)
    ).toBe(true);
    await MongoChat.collection.updateOne({ _id: bad._id }, { $set: { teamId: oid() } });
    expect(await backfillChatPublishSource(state.context)).toEqual({
      chats: 2,
      chatLogs: 0,
      missingChannelIds: 2
    });
    expect(state.failures()).toEqual([]);
    expect((await MongoChat.collection.findOne({ _id: bad._id }))?.shareId).toBe(
      'keep-until-repaired'
    );
  });

  it('失去执行权时不写业务数据，也不标记成功', async () => {
    await seed();
    const { context } = createContext();
    context.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(backfillChatPublishSource(context)).rejects.toThrow('lease lost');
    expect(await MongoChat.countDocuments({ publishSource: { $exists: true } })).toBe(0);
    expect(context.reportProgress.mock.calls).not.toContainEqual([
      { key: 'validation', status: 'succeeded' }
    ]);
  });

  it('批量写入部分成功后异常，不推进该批断点，恢复时安全重放', async () => {
    for (let i = 0; i < 4; i++) await seed();
    const { context, failures } = createContext();
    const original = MongoChat.collection.bulkWrite.bind(MongoChat.collection);
    const write = vi
      .spyOn(MongoChat.collection, 'bulkWrite')
      .mockImplementationOnce((...args) => original(...args))
      .mockImplementationOnce(async (operations, options) => {
        await original(operations.slice(0, 1), options);
        throw new Error('write interrupted');
      });
    try {
      await expect(backfillChatPublishSource(context)).rejects.toThrow('write interrupted');
    } finally {
      write.mockRestore();
    }
    expect(context.saveCheckpoint.mock.calls.at(-1)?.[0]).toMatchObject({ chats: { scanned: 2 } });
    expect(failures()).toEqual([]);
    expect(await MongoChat.countDocuments({ 'publishSource.type': 'api' })).toBe(3);
    expect(await backfillChatPublishSource(context)).toEqual({
      chats: 4,
      chatLogs: 0,
      missingChannelIds: 4
    });
    expect(await MongoChat.countDocuments({ 'publishSource.type': 'api' })).toBe(4);
  });

  it('历史错误也按批重试，不逐条提交写入', async () => {
    for (let i = 0; i < 3; i++) await seed({ teamId: null });
    const { context, failures } = createContext();
    await expect(backfillChatPublishSource(context)).rejects.toThrow('require repair');
    expect(failures()).toHaveLength(3);
    await MongoChat.collection.updateMany({}, { $set: { teamId: oid() } });
    const write = vi.spyOn(MongoChat.collection, 'bulkWrite');
    try {
      expect(await backfillChatPublishSource(context)).toEqual({
        chats: 3,
        chatLogs: 0,
        missingChannelIds: 3
      });
      expect(write.mock.calls.map(([operations]) => operations.length)).toEqual([2, 1]);
    } finally {
      write.mockRestore();
    }
    expect(failures()).toEqual([]);
  });
});
