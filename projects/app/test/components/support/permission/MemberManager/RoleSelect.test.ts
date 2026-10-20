import { describe, expect, it } from 'vitest';
import {
  AppReadChatLogRoleVal,
  AppRoleList
} from '@fastgpt/global/support/permission/app/constant';
import {
  ManageRoleVal,
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import {
  getAssignableSingleRoles,
  replaceSingleRole
} from '@/components/support/permission/MemberManager/RoleSelect';

describe('replaceSingleRole', () => {
  it('preserves application-specific roles when changing the base role', () => {
    expect(
      replaceSingleRole({
        role: ReadRoleVal | AppReadChatLogRoleVal,
        selectedSingleRole: ReadRoleVal,
        newSingleRole: WriteRoleVal
      })
    ).toBe(WriteRoleVal | AppReadChatLogRoleVal);

    expect(
      replaceSingleRole({
        role: WriteRoleVal | AppReadChatLogRoleVal,
        selectedSingleRole: WriteRoleVal,
        newSingleRole: ManageRoleVal
      })
    ).toBe(ManageRoleVal | AppReadChatLogRoleVal);
  });

  it('replaces the base role when no additional role is present', () => {
    expect(
      replaceSingleRole({
        role: ReadRoleVal,
        selectedSingleRole: ReadRoleVal,
        newSingleRole: WriteRoleVal
      })
    ).toBe(WriteRoleVal);
  });
});

describe('getAssignableSingleRoles', () => {
  it('lets an administrator granted only through a group or organization assign roles', () => {
    // 群组/组织管理员在资源 ACL 中没有自己的成员行，只有 manage 权限位。
    const adminByGroup = new Permission({ role: ManageRoleVal });

    expect(adminByGroup.hasManagePer).toBe(true);
    expect(
      getAssignableSingleRoles({
        roleList: DatasetRoleList,
        myPermission: adminByGroup,
        targetRole: ReadRoleVal
      })
    ).toEqual([ReadRoleVal, WriteRoleVal]);
  });

  it('withholds the manage role from a non-owner administrator', () => {
    expect(
      getAssignableSingleRoles({
        roleList: AppRoleList,
        myPermission: new Permission({ role: ManageRoleVal }),
        targetRole: ReadRoleVal
      })
    ).toEqual([ReadRoleVal, WriteRoleVal]);
  });

  it('reserves editing existing administrators and promoting peers for the owner', () => {
    const adminByGroup = new Permission({ role: ManageRoleVal });

    // 非所有者管理员不能编辑已是管理员的协作者。
    expect(
      getAssignableSingleRoles({
        roleList: AppRoleList,
        myPermission: adminByGroup,
        targetRole: ManageRoleVal
      })
    ).toEqual([]);
    // 所有者可以。
    expect(
      getAssignableSingleRoles({
        roleList: AppRoleList,
        myPermission: new Permission({ role: OwnerRoleVal }),
        targetRole: ManageRoleVal
      })
    ).toEqual([ReadRoleVal, WriteRoleVal, ManageRoleVal]);
  });

  it('offers nothing to a viewer without manage permission', () => {
    expect(
      getAssignableSingleRoles({
        roleList: DatasetRoleList,
        myPermission: new Permission({ role: WriteRoleVal }),
        targetRole: ReadRoleVal
      })
    ).toEqual([]);
  });

  it('ignores multiple-select roles in the single-select options', () => {
    expect(
      getAssignableSingleRoles({
        roleList: AppRoleList,
        myPermission: new Permission({ role: OwnerRoleVal }),
        targetRole: ReadRoleVal
      })
    ).toEqual([ReadRoleVal, WriteRoleVal, ManageRoleVal]);
  });
});
