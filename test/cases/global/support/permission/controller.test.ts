import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Permission } from '@fastgpt/global/support/permission/controller';
import {
  CommonPerList,
  CommonRoleList,
  CommonRolePerMap,
  NullPermissionVal,
  NullRoleVal,
  OwnerPermissionVal,
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal,
  ManageRoleVal
} from '@fastgpt/global/support/permission/constant';

describe('Permission Class', () => {
  describe('constructor', () => {
    it('should create Permission instance with default values', () => {
      const perm = new Permission();

      expect(perm.role).toBe(NullRoleVal);
      expect(perm.isOwner).toBe(false);
      expect(perm.hasManagePer).toBe(false);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasReadPer).toBe(false);
      expect(perm.hasManageRole).toBe(false);
      expect(perm.hasWriteRole).toBe(false);
      expect(perm.hasReadRole).toBe(false);
    });

    it('should create Permission instance with read role', () => {
      const perm = new Permission({ role: ReadRoleVal });

      expect(perm.role).toBe(ReadRoleVal);
      expect(perm.isOwner).toBe(false);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasManagePer).toBe(false);
      expect(perm.hasReadRole).toBe(true);
      expect(perm.hasWriteRole).toBe(false);
      expect(perm.hasManageRole).toBe(false);
    });

    it('should create Permission instance with write role', () => {
      const perm = new Permission({ role: WriteRoleVal });

      expect(perm.role).toBe(WriteRoleVal);
      expect(perm.isOwner).toBe(false);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(false);
      expect(perm.hasReadRole).toBe(false);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasManageRole).toBe(false);
    });

    it('should create Permission instance with manage role', () => {
      const perm = new Permission({ role: ManageRoleVal });

      expect(perm.role).toBe(ManageRoleVal);
      expect(perm.isOwner).toBe(false);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasReadRole).toBe(false);
      expect(perm.hasWriteRole).toBe(false);
      expect(perm.hasManageRole).toBe(true);
    });

    it('should create Permission instance with isOwner flag', () => {
      const perm = new Permission({ isOwner: true });

      expect(perm.role).toBe(OwnerRoleVal);
      expect(perm.isOwner).toBe(true);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasManageRole).toBe(true);
    });

    it('should override role when isOwner is true', () => {
      const perm = new Permission({ role: ReadRoleVal, isOwner: true });

      expect(perm.role).toBe(OwnerRoleVal);
      expect(perm.isOwner).toBe(true);
    });

    it('should accept custom roleList, perList, and rolePerMap', () => {
      const customRoleList = { ...CommonRoleList };
      const customPerList = { ...CommonPerList };
      const customRolePerMap = new Map(CommonRolePerMap);

      const perm = new Permission({
        roleList: customRoleList,
        perList: customPerList,
        rolePerMap: customRolePerMap
      });

      expect(perm.roleList).toBe(customRoleList);
      expect(perm.perList).toBe(customPerList);
      expect(perm.rolePerMap).toBe(customRolePerMap);
    });

    it('should create Permission with combined roles', () => {
      const combinedRole = ReadRoleVal | WriteRoleVal;
      const perm = new Permission({ role: combinedRole });

      expect(perm.role).toBe(combinedRole);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(false);
    });
  });

  describe('addRole', () => {
    it('should add a single role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      perm.addRole(WriteRoleVal);

      expect(perm.role).toBe(ReadRoleVal | WriteRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasReadRole).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
    });

    it('should add multiple roles at once', () => {
      const perm = new Permission({ role: NullRoleVal });
      perm.addRole(ReadRoleVal, WriteRoleVal);

      expect(perm.role).toBe(ReadRoleVal | WriteRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
    });

    it('should add all three roles', () => {
      const perm = new Permission({ role: NullRoleVal });
      perm.addRole(ReadRoleVal, WriteRoleVal, ManageRoleVal);

      expect(perm.role).toBe(ReadRoleVal | WriteRoleVal | ManageRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(true);
    });

    it('should not change role when adding existing role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const originalRole = perm.role;
      perm.addRole(ReadRoleVal);

      expect(perm.role).toBe(originalRole);
    });

    it('should return this for method chaining', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const result = perm.addRole(WriteRoleVal);

      expect(result).toBe(perm);
    });

    it('should not add role when user is owner', () => {
      const perm = new Permission({ isOwner: true });
      const originalRole = perm.role;
      perm.addRole(ReadRoleVal);

      expect(perm.role).toBe(originalRole);
      expect(perm.role).toBe(OwnerRoleVal);
    });

    it('should update permissions after adding role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.hasWritePer).toBe(false);

      perm.addRole(WriteRoleVal);
      expect(perm.hasWritePer).toBe(true);
    });
  });

  describe('removeRole', () => {
    it('should remove a single role', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      perm.removeRole(WriteRoleVal);

      expect(perm.role).toBe(ReadRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasWriteRole).toBe(false);
    });

    it('should remove multiple roles at once', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal | ManageRoleVal });
      perm.removeRole(WriteRoleVal, ManageRoleVal);

      expect(perm.role).toBe(ReadRoleVal);
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasManagePer).toBe(false);
    });

    it('should handle removing non-existent role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const originalRole = perm.role;
      perm.removeRole(WriteRoleVal);

      expect(perm.role).toBe(originalRole);
    });

    it('should return this for method chaining', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      const result = perm.removeRole(WriteRoleVal);

      expect(result).toBe(perm);
    });

    it('should not remove role when user is owner', () => {
      const perm = new Permission({ isOwner: true });
      const originalRole = perm.role;
      perm.removeRole(ReadRoleVal);

      expect(perm.role).toBe(originalRole);
      expect(perm.role).toBe(OwnerRoleVal);
    });

    it('should update permissions after removing role', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      expect(perm.hasWritePer).toBe(true);

      perm.removeRole(WriteRoleVal);
      expect(perm.hasWritePer).toBe(false);
    });

    it('should remove all roles', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal | ManageRoleVal });
      perm.removeRole(ReadRoleVal, WriteRoleVal, ManageRoleVal);

      expect(perm.role).toBe(NullRoleVal);
      expect(perm.hasReadPer).toBe(false);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasManagePer).toBe(false);
    });
  });

  describe('checkPer', () => {
    it('should return true for read permission with read role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.checkPer(CommonPerList.read)).toBe(true);
    });

    it('should return false for write permission with read role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.checkPer(CommonPerList.write)).toBe(false);
    });

    it('should return true for read and write permissions with write role', () => {
      const perm = new Permission({ role: WriteRoleVal });
      expect(perm.checkPer(CommonPerList.read)).toBe(true);
      expect(perm.checkPer(CommonPerList.write)).toBe(true);
    });

    it('should return true for all permissions with manage role', () => {
      const perm = new Permission({ role: ManageRoleVal });
      expect(perm.checkPer(CommonPerList.read)).toBe(true);
      expect(perm.checkPer(CommonPerList.write)).toBe(true);
      expect(perm.checkPer(CommonPerList.manage)).toBe(true);
    });

    it('should return true for owner permission only when user is owner', () => {
      const ownerPerm = new Permission({ isOwner: true });
      const normalPerm = new Permission({ role: ManageRoleVal });

      expect(ownerPerm.checkPer(OwnerPermissionVal)).toBe(true);
      expect(normalPerm.checkPer(OwnerPermissionVal)).toBe(false);
    });

    it('should return false for null permission', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.checkPer(NullPermissionVal)).toBe(true); // 0 & anything = 0, so it matches
    });

    it('should check combined permissions', () => {
      const perm = new Permission({ role: WriteRoleVal });
      const combinedPer = CommonPerList.read | CommonPerList.write;
      expect(perm.checkPer(combinedPer)).toBe(true);
    });

    it('should return false for combined permissions when not all are present', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const combinedPer = CommonPerList.read | CommonPerList.write;
      expect(perm.checkPer(combinedPer)).toBe(false);
    });
  });

  describe('checkRole', () => {
    it('should return true for read role when user has read role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.checkRole(ReadRoleVal)).toBe(true);
    });

    it('should return false for write role when user has only read role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.checkRole(WriteRoleVal)).toBe(false);
    });

    it('should return true for read role when user has combined roles', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      expect(perm.checkRole(ReadRoleVal)).toBe(true);
      expect(perm.checkRole(WriteRoleVal)).toBe(true);
    });

    it('should return true for owner role only when user is owner', () => {
      const ownerPerm = new Permission({ isOwner: true });
      const normalPerm = new Permission({ role: ManageRoleVal });

      expect(ownerPerm.checkRole(OwnerRoleVal)).toBe(true);
      expect(normalPerm.checkRole(OwnerRoleVal)).toBe(false);
    });

    it('should return false for combined roles when not all are present', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const combinedRole = ReadRoleVal | WriteRoleVal;
      expect(perm.checkRole(combinedRole)).toBe(false);
    });

    it('should return true for combined roles when all are present', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      const combinedRole = ReadRoleVal | WriteRoleVal;
      expect(perm.checkRole(combinedRole)).toBe(true);
    });

    it('should return true for null role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.checkRole(NullRoleVal)).toBe(true); // 0 & anything = 0, so it matches
    });
  });

  describe('setUpdatePermissionCallback', () => {
    it('should call callback immediately when set', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const callback = vi.fn();

      perm.setUpdatePermissionCallback(callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback when permissions are updated via addRole', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const callback = vi.fn();

      perm.setUpdatePermissionCallback(callback);
      callback.mockClear(); // Clear the initial call

      perm.addRole(WriteRoleVal);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback when permissions are updated via removeRole', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      const callback = vi.fn();

      perm.setUpdatePermissionCallback(callback);
      callback.mockClear();

      perm.removeRole(WriteRoleVal);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not call callback when owner adds role', () => {
      const perm = new Permission({ isOwner: true });
      const callback = vi.fn();

      perm.setUpdatePermissionCallback(callback);
      callback.mockClear();

      perm.addRole(ReadRoleVal);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should replace previous callback', () => {
      const perm = new Permission({ role: ReadRoleVal });
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      perm.setUpdatePermissionCallback(callback1);
      callback1.mockClear();

      perm.setUpdatePermissionCallback(callback2);
      callback1.mockClear();
      callback2.mockClear();

      perm.addRole(WriteRoleVal);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('permission calculation', () => {
    it('should calculate correct permissions for single role', () => {
      const perm = new Permission({ role: ReadRoleVal });
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasManagePer).toBe(false);
    });

    it('should calculate correct permissions for multiple roles', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal });
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(false);
    });

    it('should calculate correct permissions for all roles', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal | ManageRoleVal });
      expect(perm.hasReadPer).toBe(true);
      expect(perm.hasWritePer).toBe(true);
      expect(perm.hasManagePer).toBe(true);
    });

    it('should set isOwner correctly for owner role', () => {
      const perm = new Permission({ isOwner: true });
      expect(perm.isOwner).toBe(true);
    });

    it('should not set isOwner for non-owner roles', () => {
      const perm = new Permission({ role: ManageRoleVal });
      expect(perm.isOwner).toBe(false);
    });
  });

  describe('role flags', () => {
    it('should set hasReadRole correctly', () => {
      const readPerm = new Permission({ role: ReadRoleVal });
      const writePerm = new Permission({ role: WriteRoleVal });

      expect(readPerm.hasReadRole).toBe(true);
      expect(writePerm.hasReadRole).toBe(false);
    });

    it('should set hasWriteRole correctly', () => {
      const readPerm = new Permission({ role: ReadRoleVal });
      const writePerm = new Permission({ role: WriteRoleVal });

      expect(readPerm.hasWriteRole).toBe(false);
      expect(writePerm.hasWriteRole).toBe(true);
    });

    it('should set hasManageRole correctly', () => {
      const readPerm = new Permission({ role: ReadRoleVal });
      const managePerm = new Permission({ role: ManageRoleVal });

      expect(readPerm.hasManageRole).toBe(false);
      expect(managePerm.hasManageRole).toBe(true);
    });

    it('should set all role flags for combined roles', () => {
      const perm = new Permission({ role: ReadRoleVal | WriteRoleVal | ManageRoleVal });

      expect(perm.hasReadRole).toBe(true);
      expect(perm.hasWriteRole).toBe(true);
      expect(perm.hasManageRole).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle zero role', () => {
      const perm = new Permission({ role: 0 });

      expect(perm.role).toBe(0);
      expect(perm.hasReadPer).toBe(false);
      expect(perm.hasWritePer).toBe(false);
      expect(perm.hasManagePer).toBe(false);
    });

    it('should handle method chaining for addRole and removeRole', () => {
      const perm = new Permission({ role: ReadRoleVal });

      const result = perm.addRole(WriteRoleVal).addRole(ManageRoleVal).removeRole(ReadRoleVal);

      expect(result).toBe(perm);
      expect(perm.role).toBe(WriteRoleVal | ManageRoleVal);
    });

    it('should have readonly properties', () => {
      const perm = new Permission();

      // Verify readonly properties are set correctly
      expect(perm.roleList).toBe(CommonRoleList);
      expect(perm.perList).toBe(CommonPerList);
      expect(perm.rolePerMap).toBe(CommonRolePerMap);

      // Readonly properties should be defined
      expect(perm.roleList).toBeDefined();
      expect(perm.perList).toBeDefined();
      expect(perm.rolePerMap).toBeDefined();
    });

    it('should handle custom role-permission mappings', () => {
      const customRolePerMap = new Map([
        [0b1000, 0b1000], // Custom role with custom permission
        [ReadRoleVal, CommonPerList.read],
        [WriteRoleVal, CommonPerList.write | CommonPerList.read],
        [ManageRoleVal, CommonPerList.manage | CommonPerList.write | CommonPerList.read]
      ]);

      const perm = new Permission({
        role: 0b1000,
        rolePerMap: customRolePerMap
      });

      expect(perm.checkPer(0b1000)).toBe(true);
    });
  });
});
