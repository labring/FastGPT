import { describe, it, expect } from 'vitest';
import { groupChatItemsByDeleteStatus } from '../../../../../../projects/app/src/components/core/chat/ChatContainer/utils';

type ChatSiteItemType = {
  id: string;
  content: string;
  deleteTime?: number | null;
};

describe('groupChatItemsByDeleteStatus', () => {
  it('should return an empty array when input is empty', () => {
    const result = groupChatItemsByDeleteStatus([]);
    expect(result).toEqual([]);
  });

  it('should group all normal items together', () => {
    const items: ChatSiteItemType[] = [
      { id: '1', content: 'a' },
      { id: '2', content: 'b' }
    ];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'normal',
        items
      }
    ]);
  });

  it('should group all deleted items together', () => {
    const items: ChatSiteItemType[] = [
      { id: '1', content: 'a', deleteTime: 123 },
      { id: '2', content: 'b', deleteTime: 456 }
    ];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'deleted',
        items
      }
    ]);
  });

  it('should group normal and deleted items alternately', () => {
    const items: ChatSiteItemType[] = [
      { id: '1', content: 'a' },
      { id: '2', content: 'b' },
      { id: '3', content: 'c', deleteTime: 111 },
      { id: '4', content: 'd', deleteTime: 222 },
      { id: '5', content: 'e' }
    ];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'normal',
        items: [
          { id: '1', content: 'a' },
          { id: '2', content: 'b' }
        ]
      },
      {
        type: 'deleted',
        items: [
          { id: '3', content: 'c', deleteTime: 111 },
          { id: '4', content: 'd', deleteTime: 222 }
        ]
      },
      {
        type: 'normal',
        items: [{ id: '5', content: 'e' }]
      }
    ]);
  });

  it('should handle single item normal', () => {
    const items: ChatSiteItemType[] = [{ id: '1', content: 'only' }];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'normal',
        items
      }
    ]);
  });

  it('should handle single item deleted', () => {
    const items: ChatSiteItemType[] = [{ id: '2', content: 'deleted', deleteTime: 999 }];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'deleted',
        items
      }
    ]);
  });

  it('should handle interleaved deleted and normal items', () => {
    const items: ChatSiteItemType[] = [
      { id: '1', content: 'n1' },
      { id: '2', content: 'd1', deleteTime: 1 },
      { id: '3', content: 'n2' },
      { id: '4', content: 'd2', deleteTime: 2 }
    ];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'normal',
        items: [{ id: '1', content: 'n1' }]
      },
      {
        type: 'deleted',
        items: [{ id: '2', content: 'd1', deleteTime: 1 }]
      },
      {
        type: 'normal',
        items: [{ id: '3', content: 'n2' }]
      },
      {
        type: 'deleted',
        items: [{ id: '4', content: 'd2', deleteTime: 2 }]
      }
    ]);
  });

  it('should treat deleteTime=0 as normal', () => {
    const items: ChatSiteItemType[] = [{ id: '1', content: 'd', deleteTime: 0 }];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'normal',
        items
      }
    ]);
  });

  it('should treat deleteTime=null or undefined as normal', () => {
    const items: ChatSiteItemType[] = [
      { id: '1', content: 'n1', deleteTime: null },
      { id: '2', content: 'n2', deleteTime: undefined }
    ];
    const result = groupChatItemsByDeleteStatus(items);
    expect(result).toEqual([
      {
        type: 'normal',
        items
      }
    ]);
  });
});
