import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  buildAppChatLogFilter,
  buildAppChatLogSearchFilter,
  getAppChatLogNextCursor
} from '@fastgpt/service/core/app/logs/utils';
import { SearchAppChatLogsBodySchema } from '@fastgpt/global/openapi/core/app/log/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('buildAppChatLogFilter', () => {
  const params = {
    appId: '68ad85a7463006c963799a05',
    dateStart: new Date('2026-11-01'),
    dateEnd: new Date('2026-11-10')
  };

  it.each([undefined, '', '  \t'])('omits keyword conditions for %j', (chatSearch) => {
    expect(buildAppChatLogFilter({ ...params, chatSearch })).toEqual(buildAppChatLogFilter(params));
  });

  it('adds keyword conditions when a search term is present', () => {
    expect(buildAppChatLogFilter({ ...params, chatSearch: 'hello' }).$and).toContainEqual({
      $or: [{ chatId: /hello/i }, { title: /hello/i }, { customTitle: /hello/i }]
    });
  });
});

describe('buildAppChatLogSearchFilter', () => {
  it('keeps the structured cursor in the request contract', () => {
    const cursor = {
      timestamp: 1735689600000,
      id: '68ad85a7463006c963799a05'
    };

    expect(
      SearchAppChatLogsBodySchema.parse({
        appId: '68ad85a7463006c963799a05',
        dateStart: '2026-11-01T00:00:00.000Z',
        dateEnd: '2026-11-10T23:59:59.999Z',
        cursor
      }).cursor
    ).toEqual(cursor);
  });

  it('keeps the original filter on the first page', () => {
    const where = { appId: new Types.ObjectId() };

    expect(buildAppChatLogSearchFilter({ where })).toBe(where);
  });

  it('uses updateTime and _id to continue after the cursor row', () => {
    const where = { appId: new Types.ObjectId() };
    const id = '68ad85a7463006c963799a05';
    const updateTime = new Date('2026-11-10T03:00:00.000Z');

    expect(
      buildAppChatLogSearchFilter({
        where,
        cursor: { timestamp: updateTime.getTime(), id }
      })
    ).toEqual({
      updateTime: { $lte: updateTime },
      $and: [
        where,
        {
          $or: [
            { updateTime: { $lt: updateTime } },
            { updateTime, _id: { $lt: new Types.ObjectId(id) } }
          ]
        }
      ]
    });
  });

  it('preserves the date range and continues through tied timestamps with 51-row lookahead', async () => {
    const appId = new Types.ObjectId();
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const start = new Date('2026-11-01T00:00:00Z');
    const end = new Date('2026-11-01T00:00:10Z');
    const chats = Array.from({ length: 120 }, (_, index) => ({
      _id: new Types.ObjectId(),
      appId,
      teamId,
      tmbId,
      chatId: `cursor-${index}`,
      sourceType: ChatSourceTypeEnum.app,
      source: ChatSourceEnum.api,
      updateTime: new Date(start.getTime() + Math.floor(index / 10) * 1000)
    }));
    await MongoChat.collection.insertMany(chats);
    const where = buildAppChatLogFilter({ appId: String(appId), dateStart: start, dateEnd: end });
    const sort = { updateTime: -1 as const, _id: -1 as const };
    const all = await MongoChat.collection.find(where).sort(sort).toArray();
    expect(all).toHaveLength(110);

    const after = async (cursor: { timestamp: number; id: string }) =>
      MongoChat.collection
        .find(buildAppChatLogSearchFilter({ where, cursor }))
        .sort(sort)
        .limit(51)
        .toArray();
    const cursor = { timestamp: all[49].updateTime.getTime(), id: String(all[49]._id) };
    const next = await after(cursor);
    expect(next.map((item) => String(item._id))).toEqual(
      all.slice(50, 101).map((item) => String(item._id))
    );
    const last = next[49];
    const tail = await after({ timestamp: last.updateTime.getTime(), id: String(last._id) });
    expect(tail.map((item) => String(item._id))).toEqual(
      all.slice(100).map((item) => String(item._id))
    );

    const outsideId = String(new Types.ObjectId());
    expect(await after({ timestamp: start.getTime() - 1, id: outsideId })).toHaveLength(0);
    const beforeRange = await after({ timestamp: end.getTime() + 1000, id: outsideId });
    expect(beforeRange.map((item) => String(item._id))).toEqual(
      all.slice(0, 51).map((item) => String(item._id))
    );
  });
});

describe('getAppChatLogNextCursor', () => {
  it('uses the last returned row instead of the prefetched extra row', () => {
    const returned = Array.from({ length: 50 }, (_, index) => ({
      _id: new Types.ObjectId().toString(),
      updateTime: new Date(1_800_000_000_000 - index * 1000)
    }));

    expect(
      getAppChatLogNextCursor({
        list: returned,
        hasMore: true
      })
    ).toEqual({
      timestamp: returned[49].updateTime.getTime(),
      id: returned[49]._id
    });
  });

  it('omits the cursor on the last page', () => {
    expect(
      getAppChatLogNextCursor({
        list: [{ _id: '68ad85a7463006c963799a05', updateTime: new Date() }],
        hasMore: false
      })
    ).toBeUndefined();
  });
});
