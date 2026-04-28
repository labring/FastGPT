import { describe, it, expect } from 'vitest';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import {
  AppDefaultRoleVal,
  AppReadChatLogRoleVal,
  AppRoleList
} from '@fastgpt/global/support/permission/app/constant';
import {
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal
} from '@fastgpt/global/support/permission/constant';

describe('permission/app/controller', () => {
  describe('AppPermission', () => {
    it('should create AppPermission with default role', () => {
      const perm = new AppPermission();

      expect(perm.role).toBe(AppDefaultRoleVal);
      expect(perm.roleList).toBe(AppRoleList);
      expect(perm.hasReadChatLogPer).toBe(false);
      expect(perm.hasReadChatLogRole).toBe(false);
    });

    it('should create AppPermission with empty props', () => {
      const perm = new AppPermission({});

      expect(perm.role).toBe(AppDefaultRoleVal);
    });

    it('should create AppPermission with read role', () => {
      const perm = new AppPermission({ role: ReadRoleVal });

      expect(perm.role).toBe(ReadRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
      expect(perm.hasReadChatLogPer).toBe(false);
    });

    it('should create AppPermission with write role', () => {
      const perm = new AppPermission({ role: WriteRoleVal });

      expect(perm.role).toBe(WriteRoleVal);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create AppPermission with manage role', () => {
      const perm = new AppPermission({ role: ManageRoleVal });

      expect(perm.role).toBe(ManageRoleVal);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasManageRole).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadChatLogPer).toBe(true);
    });

    it('should create AppPermission with readChatLog role', () => {
      const perm = new AppPermission({ role: AppReadChatLogRoleVal });

      expect(perm.role).toBe(AppReadChatLogRoleVal);
      expect(perm.hasReadChatLogPer).toBe(true);
      expect(perm.hasReadChatLogRole).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create AppPermission as owner', () => {
      const perm = new AppPermission({ isOwner: true });

      expect(perm.isOwner).toBe(true);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadChatLogPer).toBe(true);
    });

    it('should update readChatLog permissions when role changes', () => {
      const perm = new AppPermission({ role: ReadRoleVal });

      expect(perm.hasReadChatLogPer).toBe(false);

      perm.addRole(AppReadChatLogRoleVal);

      expect(perm.hasReadChatLogPer).toBe(true);
      expect(perm.hasReadChatLogRole).toBe(true);
    });
  });
});
