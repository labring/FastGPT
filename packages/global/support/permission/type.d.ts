import type { UserModelSchema } from '../user/type';
import type { RequireOnlyOne } from '../../common/type/utils';
import type { TeamMemberSchema } from '../user/team/type';
import { MemberGroupSchemaType } from './memberGroup/type';
import type { TeamMemberWithUserSchema } from '../user/team/type';
import type { CommonPerKeyEnum, CommonRoleKeyEnum } from './constant';
import { AuthUserTypeEnum, type CommonPerKeyEnum, type PerResourceTypeEnum } from './constant';

// PermissionValueType, the type of permission's value is a number, which is a bit field actually.
// It is spired by the permission system in Linux.
// The lowest 3 bits present the permission of reading, writing and managing.
// The higher bits are advanced permissions or extended permissions, which could be customized.
export type PermissionValueType = number;
export type RoleValueType = number;

export type ResourceType = `${PerResourceTypeEnum}`;

/**
 * Define the roles. Each role is a binary number, only one bit is set to 1.
 */
export type RoleListType<T = {}> = Readonly<
  Record<
    T | CommonRoleKeyEnum,
    Readonly<{
      name: string;
      description: string;
      value: RoleValueType;
      checkBoxType: 'single' | 'multiple';
    }>
  >
>;

/**
 * Define the permissions. Each permission is a binary number, only one bit is set to 1.
 * @example
 * CommonPerList = {
 *   read: 0b100,
 *   write: 0b010,
 *   manage: 0b001
 * }
 * @example_bad
 * CommonPerList = {
 *   write: 0b110, // bad, should be 0b010
 * }
 */
export type PermissionListType<T = {}> = Readonly<
  Record<T | CommonPerKeyEnum, PermissionValueType>
>;

/**
 * Define the role-permission map. Each role has a permission.
 * @key: role (binary number), only one bit is set to 1.
 * @value: permission (binary number), multiple bits are set to 1.
 * @example
 * CommonRolePerMap = {
 *   0b100: 0b100,
 *   0b010: 0b110,
 *   0b001: 0b111
 * }
 */
export type RolePerMapType = Readonly<Map<RoleValueType, PermissionValueType>>;

export type ResourcePermissionType = {
  teamId: string;
  resourceType: ResourceType;
  permission: PermissionValueType;
  resourceId: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;

export type ResourcePerWithTmbWithUser = Omit<ResourcePermissionType, 'tmbId'> & {
  tmbId: TeamMemberSchema & { user: UserModelSchema };
};

export type PermissionSchemaType = {
  defaultPermission: PermissionValueType;
  inheritPermission: boolean;
};
