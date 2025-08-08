import { CommonPerList, CommonRoleList } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { describe, expect, it } from 'vitest';
describe('Permission Helper Class Test', () => {
  it('Permission Helper Class Test', () => {
    const permission = new Permission();
    expect(permission.role).toBe(0);

    permission.addRole(CommonRoleList.manage.value);
    expect(permission.role).toBe(CommonRoleList.manage.value);
    expect(permission.checkPer(CommonPerList.manage)).toBe(true);

    permission.removeRole(CommonRoleList.read.value);
    expect(permission.checkPer(CommonPerList.manage)).toBe(true);
  });
});
