import { CommonPerList, CommonRoleList } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
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

describe('Tool Functions', () => {
  it('sumPer', () => {
    expect(sumPer(0b001, 0b010)).toBe(0b011);
    expect(sumPer(0b000, 0b000)).toBe(0b000);
    expect(sumPer(0b100, 0b001)).toBe(0b101);
    expect(sumPer(0b111, 0b010)).toBe(0b111);
    expect(sumPer(sumPer(0b001, 0b010), 0b100)).toBe(0b111);
    expect(sumPer(0b10000000, 0b01000000)).toBe(0b11000000);
  });
});
