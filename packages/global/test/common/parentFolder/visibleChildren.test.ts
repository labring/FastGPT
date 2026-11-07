import { describe, expect, it } from 'vitest';
import { getVisibleChildren } from '@fastgpt/global/common/parentFolder/visibleChildren';

const folders = [
  { _id: 'A', parentId: null, ancestorIds: [], type: 'folder' },
  { _id: 'B', parentId: 'A', ancestorIds: ['A'], type: 'folder' },
  { _id: 'C', parentId: 'B', ancestorIds: ['A', 'B'], type: 'folder' },
  { _id: 'D', parentId: 'A', ancestorIds: ['A'], type: 'folder' },
  { _id: 'tool', parentId: null, ancestorIds: [], type: 'toolFolder' }
];

const folderTypes = ['folder', 'toolFolder'];

describe('getVisibleChildren', () => {
  it('includes readable direct items and only the first folder leading to readable descendants', () => {
    expect(
      getVisibleChildren({
        currentFolderId: 'A',
        readableResources: [
          { _id: 'C', parentId: 'B', type: 'folder' },
          { _id: 'file', parentId: 'C', type: 'advanced' },
          { _id: 'D', parentId: 'A', type: 'folder' }
        ],
        folders,
        folderTypes,
        includedFolderTypes: folderTypes
      })
    ).toEqual([
      { id: 'B', folderAccessMode: 'navigate' },
      { id: 'D', folderAccessMode: 'read' }
    ]);
  });

  it('shows readable empty folders but hides inaccessible empty siblings', () => {
    expect(
      getVisibleChildren({
        currentFolderId: null,
        readableResources: [{ _id: 'D', parentId: 'A', type: 'folder' }],
        folders,
        folderTypes,
        includedFolderTypes: folderTypes
      })
    ).toEqual([{ id: 'A', folderAccessMode: 'navigate' }]);
  });

  it('does not synthesize folders excluded by the requested type filter', () => {
    expect(
      getVisibleChildren({
        currentFolderId: 'A',
        readableResources: [{ _id: 'file', parentId: 'C', type: 'advanced' }],
        folders,
        folderTypes,
        includedFolderTypes: []
      })
    ).toEqual([]);
  });

  it('keeps navigation and real read access separate', () => {
    expect(
      getVisibleChildren({
        currentFolderId: null,
        readableResources: [{ _id: 'A', parentId: null, type: 'folder' }],
        folders,
        folderTypes,
        includedFolderTypes: folderTypes
      })
    ).toEqual([{ id: 'A', folderAccessMode: 'read' }]);
  });
});
