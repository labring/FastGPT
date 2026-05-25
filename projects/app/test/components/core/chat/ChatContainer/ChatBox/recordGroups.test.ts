import { describe, expect, it } from 'vitest';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { getProcessedChatRecords } from '@/components/core/chat/ChatContainer/ChatBox/utils/recordGroups';
import type { ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

const createRecord = ({
  dataId,
  deleteTime
}: {
  dataId: string;
  deleteTime?: Date | null;
}): ChatSiteItemType => ({
  id: dataId,
  dataId,
  obj: ChatRoleEnum.Human,
  value: [
    {
      text: {
        content: dataId
      }
    }
  ],
  status: ChatStatusEnum.finish,
  deleteTime
});

describe('getProcessedChatRecords', () => {
  it('returns original records for non-log chat types', () => {
    const records = [createRecord({ dataId: 'normal-1', deleteTime: new Date() })];

    const result = getProcessedChatRecords({
      chatType: ChatTypeEnum.chat,
      chatRecords: records,
      expandedDeletedGroups: new Set()
    });

    expect(result).toBe(records);
    expect(result[0].collapseTop).toBeUndefined();
  });

  it('adds collapse metadata to each continuous deleted group in log mode', () => {
    const deletedAt = new Date('2026-05-19T00:00:00.000Z');
    const records = [
      createRecord({ dataId: 'normal-1' }),
      createRecord({ dataId: 'deleted-1', deleteTime: deletedAt }),
      createRecord({ dataId: 'deleted-2', deleteTime: deletedAt }),
      createRecord({ dataId: 'normal-2' }),
      createRecord({ dataId: 'deleted-3', deleteTime: deletedAt })
    ];

    const result = getProcessedChatRecords({
      chatType: ChatTypeEnum.log,
      chatRecords: records,
      expandedDeletedGroups: new Set(['deleted-1', 'deleted-2'])
    });

    expect(result).toHaveLength(records.length);
    expect(result[0]).toBe(records[0]);
    expect(result[3]).toBe(records[3]);

    expect(result[1]).not.toBe(records[1]);
    expect(result[1].collapseTop).toEqual({
      count: 2,
      dataIds: ['deleted-1', 'deleted-2'],
      isExpanded: true
    });
    expect(result[1].collapseBottom).toBeUndefined();

    expect(result[2]).not.toBe(records[2]);
    expect(result[2].collapseTop).toBeUndefined();
    expect(result[2].collapseBottom).toEqual({
      count: 2,
      dataIds: ['deleted-1', 'deleted-2'],
      isExpanded: true
    });

    expect(result[4].collapseTop).toEqual({
      count: 1,
      dataIds: ['deleted-3'],
      isExpanded: false
    });
    expect(result[4].collapseBottom).toEqual({
      count: 1,
      dataIds: ['deleted-3'],
      isExpanded: false
    });
    expect(records[1].collapseTop).toBeUndefined();
    expect(records[2].collapseBottom).toBeUndefined();
  });

  it('marks a deleted group as collapsed until every item in the group is expanded', () => {
    const deletedAt = new Date('2026-05-19T00:00:00.000Z');
    const records = [
      createRecord({ dataId: 'deleted-1', deleteTime: deletedAt }),
      createRecord({ dataId: 'deleted-2', deleteTime: deletedAt })
    ];

    const result = getProcessedChatRecords({
      chatType: ChatTypeEnum.log,
      chatRecords: records,
      expandedDeletedGroups: new Set(['deleted-1'])
    });

    expect(result[0].collapseTop?.isExpanded).toBe(false);
    expect(result[1].collapseBottom?.isExpanded).toBe(false);
  });
});
