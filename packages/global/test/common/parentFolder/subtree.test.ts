import { describe, expect, it, vi } from 'vitest';
import { getDescendantFolderIds } from '@fastgpt/global/common/parentFolder/subtree';

const id = (n: number) => n.toString(16).padStart(24, '0');

/**
 * 用一棵内存树构造 findChildFolders：入参为该层全部文件夹 ID，返回它们的文件夹子级。
 * childrenByParent 只放文件夹，文件不进这棵树。
 */
const stubChildFolders = (childrenByParent: Record<string, string[]>) => {
  const calls: string[][] = [];
  const findChildFolders = async (folderIds: string[]) => {
    calls.push([...folderIds]);
    return folderIds.flatMap((folderId) => childrenByParent[folderId] ?? []);
  };
  return { findChildFolders, calls };
};

describe('getDescendantFolderIds', () => {
  it('按层收集后代，不含起点自身', async () => {
    const { findChildFolders } = stubChildFolders({
      [id(1)]: [id(2), id(3)],
      [id(2)]: [id(4)]
    });

    const result = await getDescendantFolderIds({
      rootIds: [id(1)],
      findChildFolders
    });

    expect(result).toEqual({ ids: [id(2), id(3), id(4)], truncated: false });
  });

  it('同层多个文件夹应合并为一次调用', async () => {
    const { findChildFolders, calls } = stubChildFolders({
      [id(1)]: [id(2), id(3)],
      [id(2)]: [id(4)],
      [id(3)]: [id(5)]
    });

    await getDescendantFolderIds({ rootIds: [id(1)], findChildFolders });

    expect(calls).toEqual([[id(1)], [id(2), id(3)], [id(4), id(5)]]);
  });

  it('支持多个起点，同一层合并为一次调用', async () => {
    const { findChildFolders, calls } = stubChildFolders({
      [id(1)]: [id(3)],
      [id(2)]: [id(4)]
    });

    const result = await getDescendantFolderIds({
      rootIds: [id(1), id(2)],
      findChildFolders
    });

    expect(result.ids).toEqual([id(3), id(4)]);
    expect(calls[0]).toEqual([id(1), id(2)]);
  });

  it('子级指回起点的脏数据应被跳过且不死循环', async () => {
    const { findChildFolders } = stubChildFolders({
      [id(1)]: [id(2)],
      [id(2)]: [id(1)]
    });

    const result = await getDescendantFolderIds({
      rootIds: [id(1)],
      findChildFolders
    });

    expect(result).toEqual({ ids: [id(2)], truncated: false });
  });

  it('触达节点上限时应截断并标记 truncated', async () => {
    const { findChildFolders } = stubChildFolders({
      [id(1)]: Array.from({ length: 5 }, (_, index) => id(100 + index))
    });

    const result = await getDescendantFolderIds({
      rootIds: [id(1)],
      findChildFolders,
      maxNodes: 3
    });

    expect(result.ids).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('触达深度上限时应截断并标记 truncated', async () => {
    const { findChildFolders } = stubChildFolders({
      [id(1)]: [id(2)],
      [id(2)]: [id(3)],
      [id(3)]: [id(4)]
    });

    const result = await getDescendantFolderIds({
      rootIds: [id(1)],
      findChildFolders,
      maxDepth: 2
    });

    expect(result).toEqual({ ids: [id(2), id(3)], truncated: true });
  });

  it('起点非 24 位 hex 时应直接返回空结果，不发起查询', async () => {
    const findChildFolders = vi.fn(async () => []);

    const result = await getDescendantFolderIds({
      rootIds: ['not-an-object-id'],
      findChildFolders
    });

    expect(result).toEqual({ ids: [], truncated: false });
    expect(findChildFolders).not.toHaveBeenCalled();
  });

  it('无子级时应返回空数组且不标记截断', async () => {
    const { findChildFolders } = stubChildFolders({});

    const result = await getDescendantFolderIds({
      rootIds: [id(1)],
      findChildFolders
    });

    expect(result).toEqual({ ids: [], truncated: false });
  });
});
