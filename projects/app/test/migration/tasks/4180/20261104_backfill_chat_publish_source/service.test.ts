import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { backfillPublishSourceBatch } from '@/migration/tasks/4180/20261104_backfill_chat_publish_source/service';

const oid = () => new Types.ObjectId();
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

describe('backfillPublishSourceBatch', () => {
  it('旧资源类型不阻断来源回填，仅明确归属应用的记录恢复外链 ID，旧值保持不变', async () => {
    const channel = await MongoOutLink.create({
      teamId: oid(),
      appId: oid(),
      tmbId: oid(),
      type: 'share',
      shareId: 'legacy-source-type',
      name: '历史入口'
    });
    const sourceTypes = [
      undefined,
      'app',
      'skillEdit',
      'workflowBuilder',
      'chatAgentHelper',
      null,
      '',
      'legacy-resource',
      false,
      0,
      { $eq: 'app' }
    ];
    const records = await Promise.all(
      sourceTypes.map((sourceType) =>
        seed({
          teamId: channel.teamId,
          appId: channel.appId,
          source: 'share',
          shareId: channel.shareId,
          ...(sourceType === undefined ? {} : { sourceType })
        })
      )
    );

    expect(
      (
        await backfillPublishSourceBatch({
          stage: 'chats',
          ids: records.map((record) => String(record._id))
        })
      ).size
    ).toBe(0);
    for (const [index, record] of records.entries()) {
      expect(await MongoChat.collection.findOne({ _id: record._id })).toEqual({
        ...record,
        publishSource: {
          type: 'share',
          ...(sourceTypes[index] === undefined || sourceTypes[index] === 'app'
            ? { id: channel._id }
            : {})
        }
      });
    }
  });

  it('100 条记录只批量读取和提交一次，不逐条 update，且不改旧字段', async () => {
    const records = await Promise.all(
      Array.from({ length: 100 }, (_, i) => seed({ source: i % 2 ? 'api' : 'online' }))
    );
    const read = vi.spyOn(MongoChat.collection, 'find');
    const write = vi.spyOn(MongoChat.collection, 'bulkWrite');
    const singleWrite = vi.spyOn(MongoChat.collection, 'updateOne');
    try {
      const failures = await backfillPublishSourceBatch({
        stage: 'chats',
        ids: records.map((record) => String(record._id))
      });
      expect(failures.size).toBe(0);
      expect(read).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0]).toHaveLength(100);
      expect(singleWrite).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      write.mockRestore();
      singleWrite.mockRestore();
    }
    const migrated = await MongoChat.collection.find({}).sort({ _id: 1 }).toArray();
    for (const record of records) {
      expect(migrated.find((raw) => raw._id.equals(record._id))).toEqual({
        ...record,
        publishSource: { type: record.source }
      });
    }
  });

  it('已有新来源不受旧字段影响；无待回填数据不写库，坏数据按 ID 返回', async () => {
    const existing = await seed({ source: 'unknown', publishSource: { type: 'api', id: oid() } });
    const invalid = await seed({ publishSource: { type: 'unknown' } });
    const invalidLegacy = await seed({ source: 'unknown', sourceType: 'legacy-resource' });
    const write = vi.spyOn(MongoChat.collection, 'bulkWrite');
    try {
      expect((await backfillPublishSourceBatch({ stage: 'chats', ids: [] })).size).toBe(0);
      const failures = await backfillPublishSourceBatch({
        stage: 'chats',
        ids: [existing, invalid, invalidLegacy]
          .map((record) => String(record._id))
          .concat(String(oid()))
      });
      expect([...failures.keys()].sort()).toEqual(
        [String(invalid._id), String(invalidLegacy._id)].sort()
      );
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
    expect(await MongoChat.collection.findOne({ _id: existing._id })).toEqual(existing);
  });

  it('批量查询外链仍拒绝跨团队、跨应用、重复匹配和类型冲突，不影响有效记录', async () => {
    const record = await seed({ source: 'share', shareId: 'public' });
    const valid = await seed({ source: 'share', shareId: 'valid' });
    const base = {
      teamId: record.teamId,
      appId: record.appId,
      tmbId: oid(),
      shareId: 'public',
      name: '入口'
    };
    const channel = await MongoOutLink.create({ ...base, teamId: oid(), type: 'share' });
    const validChannel = await MongoOutLink.create({
      ...base,
      teamId: valid.teamId,
      appId: valid.appId,
      shareId: 'valid',
      type: 'share'
    });
    const run = () =>
      backfillPublishSourceBatch({
        stage: 'chats',
        ids: [String(record._id), String(valid._id)]
      });
    expect((await run()).get(String(record._id))).toMatchObject({
      message: expect.stringContaining('another team')
    });
    await MongoOutLink.updateOne(
      { _id: channel._id },
      { $set: { teamId: record.teamId, appId: oid() } }
    );
    expect((await run()).get(String(record._id))).toMatchObject({
      message: expect.stringContaining('another team')
    });
    await MongoOutLink.updateOne(
      { _id: channel._id },
      { $set: { appId: record.appId, type: 'feishu' } }
    );
    expect((await run()).get(String(record._id))).toMatchObject({
      message: expect.stringContaining('type does not match')
    });
    await MongoOutLink.updateOne({ _id: channel._id }, { $set: { type: 'share' } });
    await MongoOutLink.create({ ...base, type: 'share' });
    expect((await run()).get(String(record._id))).toMatchObject({
      message: expect.stringContaining('multiple channels')
    });
    expect(
      (await MongoChat.collection.findOne({ _id: record._id }))?.publishSource
    ).toBeUndefined();
    expect((await MongoChat.collection.findOne({ _id: valid._id }))?.publishSource).toEqual({
      type: 'share',
      id: validChannel._id
    });
  });

  it('CAS 冲突整批重读，保留最新来源；未回填项留待重试，物理删除不报错', async () => {
    const current = await seed();
    const changed = await seed();
    const deleted = await seed();
    const stable = await seed();
    const next = { type: 'api', id: oid() };
    const original = MongoChat.collection.bulkWrite.bind(MongoChat.collection);
    const read = vi.spyOn(MongoChat.collection, 'find');
    const write = vi
      .spyOn(MongoChat.collection, 'bulkWrite')
      .mockImplementationOnce(async (...args) => {
        await MongoChat.collection.updateOne(
          { _id: current._id },
          { $set: { publishSource: next, sourceName: '最新入口' } }
        );
        await MongoChat.collection.updateOne({ _id: changed._id }, { $set: { source: 'online' } });
        await MongoChat.collection.deleteOne({ _id: deleted._id });
        return original(...args);
      });
    try {
      const failures = await backfillPublishSourceBatch({
        stage: 'chats',
        ids: [current, changed, deleted, stable].map((record) => String(record._id))
      });
      expect([...failures.keys()]).toEqual([String(changed._id)]);
      expect(read).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
    expect(await MongoChat.collection.findOne({ _id: current._id })).toMatchObject({
      publishSource: next,
      sourceName: '最新入口'
    });
    expect(
      (await MongoChat.collection.findOne({ _id: changed._id }))?.publishSource
    ).toBeUndefined();
    expect((await MongoChat.collection.findOne({ _id: stable._id }))?.publishSource).toEqual({
      type: 'api'
    });
    expect(
      (await backfillPublishSourceBatch({ stage: 'chats', ids: [String(changed._id)] })).size
    ).toBe(0);
    expect((await MongoChat.collection.findOne({ _id: changed._id }))?.publishSource).toEqual({
      type: 'online'
    });
  });

  it('统计桶批量写入自身来源，不查询当前外链', async () => {
    const log = {
      _id: oid(),
      teamId: oid(),
      appId: oid(),
      source: 'share',
      sourceType: null,
      shareId: 'public',
      publishSource: null
    };
    await MongoAppChatLog.collection.insertOne(log as any);
    const channels = vi.spyOn(MongoOutLink, 'find');
    const write = vi.spyOn(MongoAppChatLog.collection, 'bulkWrite');
    try {
      expect(
        (await backfillPublishSourceBatch({ stage: 'chatLogs', ids: [String(log._id)] })).size
      ).toBe(0);
      expect(channels).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      channels.mockRestore();
      write.mockRestore();
    }
    expect(await MongoAppChatLog.collection.findOne({ _id: log._id })).toEqual({
      ...log,
      publishSource: { type: 'share' }
    });
  });
});
