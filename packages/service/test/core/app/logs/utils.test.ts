import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  buildAppChatLogSearchFilter,
  getAppChatLogNextCursor
} from '@fastgpt/service/core/app/logs/utils';
import { SearchAppChatLogsBodySchema } from '@fastgpt/global/openapi/core/app/log/api';

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
