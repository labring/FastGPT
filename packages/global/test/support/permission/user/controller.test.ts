import { describe, it, expect } from 'vitest';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  TeamDefaultRoleVal,
  TeamReadRoleVal,
  TeamWriteRoleVal,
  TeamManageRoleVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamApikeyCreateRoleVal,
  TeamRoleList
} from '@fastgpt/global/support/permission/user/constant';

describe('permission/user/controller', () => {
  describe('TeamPermission', () => {
    it('should create TeamPermission with default role', () => {
      const perm = new TeamPermission();

      expect(perm.role).toBe(TeamDefaultRoleVal);
      expect(perm.roleList).toBe(TeamRoleList);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
    });

    it('should create TeamPermission with empty props', () => {
      const perm = new TeamPermission({});

      expect(perm.role).toBe(TeamDefaultRoleVal);
    });

    it('should create TeamPermission with read role', () => {
      const perm = new TeamPermission({ role: TeamReadRoleVal });

      expect(perm.role).toBe(TeamReadRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
      expect(perm.hasAppCreateRole).toBe(false);
      expect(perm.hasDatasetCreateRole).toBe(false);
      expect(perm.hasApikeyCreateRole).toBe(false);
    });

    it('should create TeamPermission with write role', () => {
      const perm = new TeamPermission({ role: TeamWriteRoleVal });

      expect(perm.role).toBe(TeamWriteRoleVal);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create TeamPermission with manage role', () => {
      const perm = new TeamPermission({ role: TeamManageRoleVal });

      expect(perm.role).toBe(TeamManageRoleVal);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasManageRole).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create TeamPermission with appCreate role', () => {
      const perm = new TeamPermission({ role: TeamAppCreateRoleVal });

      expect(perm.role).toBe(TeamAppCreateRoleVal);
      expect(perm.hasAppCreateRole).toBe(true);
      expect(perm.hasAppCreatePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
    });

    it('should create TeamPermission with datasetCreate role', () => {
      const perm = new TeamPermission({ role: TeamDatasetCreateRoleVal });

      expect(perm.role).toBe(TeamDatasetCreateRoleVal);
      expect(perm.hasDatasetCreateRole).toBe(true);
      expect(perm.hasDatasetCreatePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
    });

    it('should create TeamPermission with apikeyCreate role', () => {
      const perm = new TeamPermission({ role: TeamApikeyCreateRoleVal });

      expect(perm.role).toBe(TeamApikeyCreateRoleVal);
      expect(perm.hasApikeyCreateRole).toBe(true);
      expect(perm.hasApikeyCreatePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
    });

    it('should create TeamPermission with combined roles', () => {
      const combinedRole = TeamAppCreateRoleVal | TeamDatasetCreateRoleVal;
      const perm = new TeamPermission({ role: combinedRole });

      expect(perm.hasAppCreateRole).toBe(true);
      expect(perm.hasDatasetCreateRole).toBe(true);
      expect(perm.hasApikeyCreateRole).toBe(false);
    });

    it('should create TeamPermission as owner', () => {
      const perm = new TeamPermission({ isOwner: true });

      expect(perm.isOwner).toBe(true);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should update custom permissions when role changes', () => {
      const perm = new TeamPermission({ role: TeamReadRoleVal });

      expect(perm.hasAppCreateRole).toBe(false);

      perm.addRole(TeamAppCreateRoleVal);

      expect(perm.hasAppCreateRole).toBe(true);
      expect(perm.hasAppCreatePer).toBe(true);
    });
  });
});
