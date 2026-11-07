import { describe, expect, it } from 'vitest';
import { getFolderPathIndex } from '@fastgpt/global/common/parentFolder/tree';

describe('getFolderPathIndex', () => {
  const folders = [
    { id: 'A', parentId: null },
    { id: 'B', parentId: 'A' },
    { id: 'C', parentId: 'B' },
    { id: 'other', parentId: null },
    { id: 'broken', parentId: 'missing' },
    { id: 'cycle-1', parentId: 'cycle-2' },
    { id: 'cycle-2', parentId: 'cycle-1' }
  ];

  it('builds absolute root paths and paths relative to a browsed folder', () => {
    expect(getFolderPathIndex({ folders, currentFolderId: null })).toEqual(
      new Map([
        ['A', []],
        ['B', ['A']],
        ['C', ['A', 'B']],
        ['other', []]
      ])
    );
    expect(getFolderPathIndex({ folders, currentFolderId: 'A' })).toEqual(
      new Map([
        ['A', []],
        ['B', ['A']],
        ['C', ['A', 'B']]
      ])
    );
  });

  it('omits paths outside the current folder, with broken parents, or containing cycles', () => {
    const result = getFolderPathIndex({ folders, currentFolderId: 'other' });
    expect(result.has('A')).toBe(false);
    expect(result.has('broken')).toBe(false);
    expect(result.has('cycle-1')).toBe(false);
  });
});
