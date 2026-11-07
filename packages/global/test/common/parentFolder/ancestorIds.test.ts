import { describe, expect, it } from 'vitest';
import {
  getFolderAncestorIds,
  getVisibleChildFolderId,
  rewriteFolderAncestorIds
} from '@fastgpt/global/common/parentFolder/ancestorIds';

describe('getFolderAncestorIds', () => {
  it('builds an ordered path without the folder itself', () => {
    expect(getFolderAncestorIds({ parentId: null })).toEqual([]);
    expect(getFolderAncestorIds({ parentId: 'A', parentAncestorIds: [] })).toEqual(['A']);
    expect(getFolderAncestorIds({ parentId: 'B', parentAncestorIds: ['A'] })).toEqual(['A', 'B']);
  });
});

describe('getVisibleChildFolderId', () => {
  it('returns the first child folder at root and below a current folder', () => {
    expect(
      getVisibleChildFolderId({ folderId: 'B', ancestorIds: ['A'], currentFolderId: null })
    ).toBe('A');
    expect(
      getVisibleChildFolderId({ folderId: 'B', ancestorIds: ['A'], currentFolderId: 'A' })
    ).toBe('B');
  });

  it('does not return a folder outside the current path or the current folder itself', () => {
    expect(
      getVisibleChildFolderId({ folderId: 'B', ancestorIds: ['A'], currentFolderId: 'X' })
    ).toBeNull();
    expect(
      getVisibleChildFolderId({ folderId: 'A', ancestorIds: [], currentFolderId: 'A' })
    ).toBeNull();
  });
});

describe('rewriteFolderAncestorIds', () => {
  it('replaces only the old prefix and keeps descendant paths', () => {
    expect(
      rewriteFolderAncestorIds({
        ancestorIds: ['A', 'B', 'C'],
        oldPrefix: ['A', 'B'],
        newPrefix: ['X', 'Y']
      })
    ).toEqual(['X', 'Y', 'C']);
  });

  it('supports moving to root and rejects paths outside the moved subtree', () => {
    expect(
      rewriteFolderAncestorIds({
        ancestorIds: ['A', 'B', 'C'],
        oldPrefix: ['A', 'B'],
        newPrefix: []
      })
    ).toEqual(['C']);
    expect(
      rewriteFolderAncestorIds({ ancestorIds: ['A', 'C'], oldPrefix: ['A', 'B'], newPrefix: [] })
    ).toBeNull();
  });
});
