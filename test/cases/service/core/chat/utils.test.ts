import { describe, it, expect } from 'vitest';
import { processChatTimeFilter } from '@/service/core/chat/utils';
import type { DatasetCiteItemType } from '@fastgpt/global/core/dataset/type';

describe('processChatTimeFilter', () => {
  const baseTime = new Date('2025-01-01');

  it('should return original item if no history', () => {
    const item: DatasetCiteItemType = {
      id: '1',
      q: 'original q',
      a: 'original a',
      updateTime: baseTime.getTime(),
      history: undefined
    };

    const result = processChatTimeFilter([item], baseTime);
    expect(result).toEqual([item]);
  });

  it('should return original item if updateTime <= chatTime', () => {
    const item: DatasetCiteItemType = {
      id: '1',
      q: 'original q',
      a: 'original a',
      updateTime: baseTime.getTime() - 1000,
      history: [
        {
          q: 'history q',
          a: 'history a',
          updateTime: baseTime.getTime() - 2000
        }
      ]
    };

    const result = processChatTimeFilter([item], baseTime);
    expect(result).toEqual([item]);
  });

  it('should return history item if one exists before chatTime', () => {
    const item: DatasetCiteItemType = {
      id: '1',
      q: 'original q',
      a: 'original a',
      updateTime: baseTime.getTime() + 2000,
      history: [
        {
          q: 'history q',
          a: 'history a',
          updateTime: baseTime.getTime() - 1000
        }
      ]
    };

    const result = processChatTimeFilter([item], baseTime);
    expect(result).toEqual([
      {
        ...item,
        q: 'history q',
        a: 'history a',
        updateTime: baseTime.getTime() - 1000,
        updated: true
      }
    ]);
  });

  it('should return original item if no history before chatTime', () => {
    const item: DatasetCiteItemType = {
      id: '1',
      q: 'original q',
      a: 'original a',
      updateTime: baseTime.getTime() + 2000,
      history: [
        {
          q: 'history q',
          a: 'history a',
          updateTime: baseTime.getTime() + 1000
        }
      ]
    };

    const result = processChatTimeFilter([item], baseTime);
    expect(result).toEqual([item]);
  });

  it('should handle multiple items', () => {
    const items: DatasetCiteItemType[] = [
      {
        id: '1',
        q: 'original q1',
        a: 'original a1',
        updateTime: baseTime.getTime() + 2000,
        history: [
          {
            q: 'history q1',
            a: 'history a1',
            updateTime: baseTime.getTime() - 1000
          }
        ]
      },
      {
        id: '2',
        q: 'original q2',
        a: 'original a2',
        updateTime: baseTime.getTime() - 1000,
        history: [
          {
            q: 'history q2',
            a: 'history a2',
            updateTime: baseTime.getTime() - 2000
          }
        ]
      }
    ];

    const result = processChatTimeFilter(items, baseTime);
    expect(result).toEqual([
      {
        ...items[0],
        q: 'history q1',
        a: 'history a1',
        updateTime: baseTime.getTime() - 1000,
        updated: true
      },
      items[1]
    ]);
  });
});
