import { NullRoleVal, CommonPerList, CommonRoleList, CommonRolePerMap } from '../constant';
import type { PermissionListType, RolePerMapType } from '../type';
import type { RoleListType } from '../type';

export const SkillDefaultRoleVal = NullRoleVal;

// Skill permissions currently mirror the common read/write/manage set.
// Extend here when skill-specific permission bits are needed.
export const SkillPerList: PermissionListType = { ...CommonPerList };
export const SkillRoleList: RoleListType = { ...CommonRoleList };
export const SkillRolePerMap: RolePerMapType = new Map([...CommonRolePerMap]);
