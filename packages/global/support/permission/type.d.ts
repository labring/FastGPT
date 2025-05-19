import { UserModelSchema } from '../user/type';
import { RequireOnlyOne } from '../../common/type/utils';
import { TeamMemberSchema } from '../user/team/type';
import { MemberGroupSchemaType } from './memberGroup/type';
import type { TeamMemberWithUserSchema } from '../user/team/type';
import { AuthUserTypeEnum, type PermissionKeyEnum, type PerResourceTypeEnum } from './constant';

// PermissionValueType, the type of permission's value is a number, which is a bit field actually.
// It is spired by the permission system in Linux.
// The lowest 3 bits present the permission of reading, writing and managing.
// The higher bits are advanced permissions or extended permissions, which could be customized.
export type PermissionValueType = number;
export type ResourceType = `${PerResourceTypeEnum}`;

export type PermissionListType<T = {}> = Record<
  T | PermissionKeyEnum,
  {
    name: string;
    description: string;
    value: PermissionValueType;
    checkBoxType: 'single' | 'multiple';
  }
>;

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
