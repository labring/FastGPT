import { describe, it, expect } from 'vitest';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import {
  DataSetDefaultRoleVal,
  DatasetRoleList
} from '@fastgpt/global/support/permission/dataset/constant';
import {
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal
} from '@fastgpt/global/support/permission/constant';

describe('permission/dataset/controller', () => {
  describe('DatasetPermission', () => {
    it('should create DatasetPermission with default role', () => {
      const perm = new DatasetPermission();

      expect(perm.role).toBe(DataSetDefaultRoleVal);
      expect(perm.roleList).toBe(DatasetRoleList);
    });

    it('should create DatasetPermission with empty props', () => {
      const perm = new DatasetPermission({});

      expect(perm.role).toBe(DataSetDefaultRoleVal);
    });

    it('should create DatasetPermission with specific role', () => {
      const perm = new DatasetPermission({ role: ReadRoleVal });

      expect(perm.role).toBe(ReadRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
    });

    it('should create DatasetPermission with write role', () => {
      const perm = new DatasetPermission({ role: WriteRoleVal });

      expect(perm.role).toBe(WriteRoleVal);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create DatasetPermission with manage role', () => {
      const perm = new DatasetPermission({ role: ManageRoleVal });

      expect(perm.role).toBe(ManageRoleVal);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasManageRole).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });

    it('should create DatasetPermission as owner', () => {
      const perm = new DatasetPermission({ isOwner: true });

      expect(perm.isOwner).toBe(true);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadPer).toBe(true);
    });
  });
});
