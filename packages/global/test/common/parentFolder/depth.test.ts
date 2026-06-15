import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_FOLDER_DEPTH,
  canCreateFolderAtDepth,
  canCreateSubFolder,
  getCurrentFolderLevel,
  isPathsSyncedWithParent,
  normalizeParentId
} from '@fastgpt/global/common/parentFolder/depth';

describe('parent folder depth utils', () => {
  describe('normalizeParentId', () => {
    it('keeps non-empty string parent ids and treats other values as root', () => {
      expect(normalizeParentId('parent-1')).toBe('parent-1');
      expect(normalizeParentId('')).toBeNull();
      expect(normalizeParentId(null)).toBeNull();
      expect(normalizeParentId(undefined)).toBeNull();
      expect(normalizeParentId(123)).toBeNull();
    });
  });

  describe('isPathsSyncedWithParent', () => {
    it('requires empty paths at root', () => {
      expect(isPathsSyncedWithParent(null, [])).toBe(true);
      expect(isPathsSyncedWithParent(undefined, [])).toBe(true);
      expect(isPathsSyncedWithParent('', [])).toBe(true);
      expect(isPathsSyncedWithParent(null, [{ parentId: 'stale' }])).toBe(false);
    });

    it('matches non-root parent id with the last path item', () => {
      expect(
        isPathsSyncedWithParent('parent-2', [{ parentId: 'parent-1' }, { parentId: 'parent-2' }])
      ).toBe(true);
      expect(isPathsSyncedWithParent('parent-2', [])).toBe(false);
      expect(isPathsSyncedWithParent('parent-2', [{ parentId: 'parent-1' }])).toBe(false);
      expect(isPathsSyncedWithParent('parent-2', [{ parentId: null }])).toBe(false);
    });
  });

  describe('getCurrentFolderLevel', () => {
    it('returns 0 at root and paths length inside a folder', () => {
      expect(getCurrentFolderLevel(null, 3)).toBe(0);
      expect(getCurrentFolderLevel('', 3)).toBe(0);
      expect(getCurrentFolderLevel('parent-1', 3)).toBe(3);
    });
  });

  describe('canCreateFolderAtDepth', () => {
    it('uses default max depth and handles the exact boundary', () => {
      expect(DEFAULT_MAX_FOLDER_DEPTH).toBe(4);
      expect(canCreateFolderAtDepth(0)).toBe(true);
      expect(canCreateFolderAtDepth(3)).toBe(true);
      expect(canCreateFolderAtDepth(4)).toBe(false);
    });

    it('respects a custom max folder level', () => {
      expect(canCreateFolderAtDepth(1, 2)).toBe(true);
      expect(canCreateFolderAtDepth(2, 2)).toBe(false);
    });
  });

  describe('canCreateSubFolder', () => {
    it('supports numeric paths length', () => {
      expect(canCreateSubFolder(null, 10)).toBe(true);
      expect(canCreateSubFolder('parent-3', 3)).toBe(true);
      expect(canCreateSubFolder('parent-4', 4)).toBe(false);
      expect(canCreateSubFolder('parent-2', 2, 2)).toBe(false);
    });

    it('allows creation when paths are stale and otherwise follows synced paths depth', () => {
      expect(canCreateSubFolder('parent-2', [{ parentId: 'parent-1' }])).toBe(true);
      expect(
        canCreateSubFolder('parent-4', [
          { parentId: 'parent-1' },
          { parentId: 'parent-2' },
          { parentId: 'parent-3' },
          { parentId: 'parent-4' }
        ])
      ).toBe(false);
      expect(
        canCreateSubFolder('parent-3', [
          { parentId: 'parent-1' },
          { parentId: 'parent-2' },
          { parentId: 'parent-3' }
        ])
      ).toBe(true);
    });
  });
});
