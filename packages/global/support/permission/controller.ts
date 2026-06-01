import type {
  RoleValueType,
  RoleListType,
  PermissionValueType,
  PermissionListType,
  RolePerMapType
} from './type';
import {
  CommonPerList,
  CommonRoleList,
  CommonRolePerMap,
  NullRoleVal,
  OwnerPermissionVal,
  OwnerRoleVal
} from './constant';
import z from 'zod';

export type PerConstructPros = {
  role?: RoleValueType;

  isOwner?: boolean;

  roleList?: RoleListType;
  perList?: PermissionListType;
  rolePerMap?: RolePerMapType;
};

/**
 * the Permission helper class
 */
export class Permission {
  role: PermissionValueType;
  private permission: PermissionValueType = NullRoleVal; // default role

  isOwner: boolean = false;

  hasManagePer: boolean = false;
  hasWritePer: boolean = false;
  hasReadPer: boolean = false;
  hasManageRole: boolean = false;
  hasWriteRole: boolean = false;
  hasReadRole: boolean = false;

  readonly roleList: RoleListType;
  readonly perList: PermissionListType;
  readonly rolePerMap: RolePerMapType;

  constructor({
    role = NullRoleVal,
    isOwner = false,
    roleList = CommonRoleList,
    perList = CommonPerList,
    rolePerMap = CommonRolePerMap
  }: PerConstructPros = {}) {
    if (isOwner) {
      this.role = OwnerRoleVal;
    } else {
      this.role = role;
    }

    this.roleList = roleList;
    this.perList = perList;
    this.rolePerMap = rolePerMap;
    this.updatePermissions();
  }

  addRole(...roleList: RoleValueType[]) {
    if (this.isOwner) {
      return this;
    }
    for (const per of roleList) {
      this.role = this.role | per;
    }
    this.updatePermissions();
    return this;
  }

  removeRole(...roleList: RoleValueType[]) {
    if (this.isOwner) {
      return this.role;
    }
    for (const per of roleList) {
      this.role = this.role & ~per;
    }
    this.updatePermissions();
    return this;
  }

  checkPer(perm: PermissionValueType): boolean {
    // if the permission is owner permission, only owner has this permission.
    if (perm === OwnerPermissionVal) {
      return this.permission === OwnerPermissionVal;
    }
    return (this.permission & perm) === perm;
  }

  checkRole(role: RoleValueType): boolean {
    if (role === OwnerRoleVal) {
      return this.role === OwnerRoleVal;
    }
    return (this.role & role) === role;
  }

  private updatePermissionCallback?: () => void;
  setUpdatePermissionCallback(callback: () => void) {
    callback();
    this.updatePermissionCallback = callback;
  }

  private calculatePer() {
    if (this.role === OwnerRoleVal) {
      this.permission = OwnerPermissionVal;
      return;
    }

    let role = this.role;
    this.permission = 0;
    while (role > 0) {
      // Binary Magic
      this.permission |= this.rolePerMap.get(role & -role) ?? 0;
      role &= role - 1;
    }
  }

  private updatePermissions() {
    this.calculatePer();

    this.isOwner = this.permission === OwnerRoleVal;
    this.hasManagePer = this.checkPer(this.roleList['manage'].value);
    this.hasWritePer = this.checkPer(this.roleList['write'].value);
    this.hasReadPer = this.checkPer(this.roleList['read'].value);
    this.hasManageRole = this.checkRole(this.roleList['manage'].value);
    this.hasWriteRole = this.checkRole(this.roleList['write'].value);
    this.hasReadRole = this.checkRole(this.roleList['read'].value);

    this.updatePermissionCallback?.();
  }
}

// HTTP 响应会把 Permission 类实例序列化为普通对象，OpenAPI 需要声明前端实际依赖的 JSON 字段。
export const PermissionSchema = z
  .object({
    role: z.number().int().meta({ description: '权限角色值' }),
    isOwner: z.boolean().meta({ description: '是否为所有者' }),
    hasManagePer: z.boolean().meta({ description: '是否拥有管理权限' }),
    hasWritePer: z.boolean().meta({ description: '是否拥有写权限' }),
    hasReadPer: z.boolean().meta({ description: '是否拥有读权限' }),
    hasManageRole: z.boolean().meta({ description: '是否包含管理角色' }),
    hasWriteRole: z.boolean().meta({ description: '是否包含写角色' }),
    hasReadRole: z.boolean().meta({ description: '是否包含读角色' })
  })
  .passthrough()
  .meta({ description: '权限对象序列化后的 JSON 结构' }) as unknown as z.ZodType<Permission>;
