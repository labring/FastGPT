import { PermissionValueType } from './type';
import { PermissionList, NullPermission, OwnerPermissionVal } from './constant';

export type PerConstructPros = {
  per?: PermissionValueType;
  isOwner?: boolean;
};

// the Permission helper class
export class Permission {
  value: PermissionValueType;
  isOwner: boolean;
  hasManagePer: boolean;
  hasWritePer: boolean;
  hasReadPer: boolean;

  constructor(props?: PerConstructPros) {
    const { per = NullPermission, isOwner = false } = props || {};
    if (isOwner) {
      this.value = OwnerPermissionVal;
    } else {
      this.value = per;
    }

    this.isOwner = isOwner;
    this.hasManagePer = this.checkPer(PermissionList['manage'].value);
    this.hasWritePer = this.checkPer(PermissionList['write'].value);
    this.hasReadPer = this.checkPer(PermissionList['read'].value);
  }

  // add permission(s)
  // it can be chaining called.
  // @example
  // const perm = new Permission(permission)
  // perm.add(PermissionList['read'])
  // perm.add(PermissionList['read'], PermissionList['write'])
  // perm.add(PermissionList['read']).add(PermissionList['write'])
  addPer(...perList: PermissionValueType[]) {
    for (let oer of perList) {
      this.value = this.value | oer;
    }
    this.updatePermissions();
    return this.value;
  }

  removePer(...perList: PermissionValueType[]) {
    for (let per of perList) {
      this.value = this.value & ~per;
    }
    this.updatePermissions();
    return this.value;
  }

  checkPer(perm: PermissionValueType): boolean {
    // if the permission is owner permission, only owner has this permission.
    if (perm === OwnerPermissionVal) {
      return this.value === OwnerPermissionVal;
    } else if (this.hasManagePer) {
      // The manager has all permissions except the owner permission
      return true;
    }
    return (this.value & perm) === perm;
  }

  private updatePermissions() {
    this.isOwner = this.value === OwnerPermissionVal;
    this.hasManagePer = this.checkPer(PermissionList['manage'].value);
    this.hasWritePer = this.checkPer(PermissionList['write'].value);
    this.hasReadPer = this.checkPer(PermissionList['read'].value);
  }
}
