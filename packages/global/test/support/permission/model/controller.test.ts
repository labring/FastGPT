import { describe, it, expect } from 'vitest';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import {
  NullRoleVal,
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal
} from '@fastgpt/global/support/permission/constant';

describe('permission/model/controller', () => {
  describe('ModelPermission', () => {
    it('should create ModelPermission with default role', () => {
      const perm = new ModelPermission();

      expect(perm.role).toBe(NullRoleVal);
      expect(perm.isOwner).toBe(false);
    });

    it('should create ModelPermission with read role', () => {
      const perm = new ModelPermission({ role: ReadRoleVal });

      expect(perm.role).toBe(ReadRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
    });

    it('should create ModelPermission with write role', () => {
      const perm = new ModelPermission({ role: WriteRoleVal });

      expect(perm.role).toBe(WriteRoleVal);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create ModelPermission with manage role', () => {
      const perm = new ModelPermission({ role: ManageRoleVal });

      expect(perm.role).toBe(ManageRoleVal);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasManageRole).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create ModelPermission as owner', () => {
      const perm = new ModelPermission({ isOwner: true });

      expect(perm.isOwner).toBe(true);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should support addRole method', () => {
      const perm = new ModelPermission({ role: ReadRoleVal });

      expect(perm.hasWriteRole).toBe(false);

      perm.addRole(WriteRoleVal);

      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasReadRole).toBe(true);
    });

    it('should support removeRole method', () => {
      const perm = new ModelPermission({ role: ReadRoleVal | WriteRoleVal });

      expect(perm.hasWriteRole).toBe(true);

      perm.removeRole(WriteRoleVal);

      expect(perm.hasWriteRole).toBe(false);
      expect(perm.hasReadRole).toBe(true);
    });
  });
});
