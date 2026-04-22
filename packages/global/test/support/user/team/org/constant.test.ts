import { describe, it, expect } from 'vitest';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import type { OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';

describe('user/team/org/constant', () => {
  describe('getOrgChildrenPath', () => {
    it('should return empty string when both path and pathId are empty', () => {
      const org: OrgSchemaType = {
        _id: 'test-id',
        teamId: 'team-id',
        pathId: '',
        path: '',
        name: 'Test Org',
        avatar: 'avatar.png',
        updateTime: new Date()
      };

      const result = getOrgChildrenPath(org);
      expect(result).toBe('');
    });

    it('should return empty string when both path and pathId are empty strings', () => {
      const org: OrgSchemaType = {
        _id: 'org-id',
        teamId: 'team-id',
        pathId: '',
        path: '',
        name: 'Empty Org',
        avatar: '',
        updateTime: new Date()
      };

      const result = getOrgChildrenPath(org);
      expect(result).toBe('');
    });

    it('should return correct path when path and pathId are provided', () => {
      const org: OrgSchemaType = {
        _id: 'test-id',
        teamId: 'team-id',
        pathId: 'child-id',
        path: '/parent',
        name: 'Test Org',
        avatar: 'avatar.png',
        updateTime: new Date()
      };

      const result = getOrgChildrenPath(org);
      expect(result).toBe('/parent/child-id');
    });

    it('should handle path with null value', () => {
      const org: OrgSchemaType = {
        _id: 'test-id',
        teamId: 'team-id',
        pathId: 'child-id',
        path: null as any,
        name: 'Test Org',
        avatar: 'avatar.png',
        updateTime: new Date()
      };

      const result = getOrgChildrenPath(org);
      expect(result).toBe('/child-id');
    });

    it('should handle empty path with non-empty pathId', () => {
      const org: OrgSchemaType = {
        _id: 'test-id',
        teamId: 'team-id',
        pathId: 'child-id',
        path: '',
        name: 'Test Org',
        avatar: 'avatar.png',
        updateTime: new Date()
      };

      const result = getOrgChildrenPath(org);
      // When path is empty but pathId is not, it returns /pathId
      expect(result).toBe('/child-id');
    });

    it('should handle root level org', () => {
      const org: OrgSchemaType = {
        _id: 'test-id',
        teamId: 'team-id',
        pathId: 'root-id',
        path: '',
        name: 'Root Org',
        avatar: 'avatar.png',
        updateTime: new Date()
      };

      const result = getOrgChildrenPath(org);
      // When path is empty but pathId is not, it returns /pathId
      expect(result).toBe('/root-id');
    });
  });
});
