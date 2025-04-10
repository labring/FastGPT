import { PermissionListType, PermissionValueType } from './type';
import { PermissionList, NullPermission, OwnerPermissionVal } from './constant';

export type PerConstructPros = {
  per?: PermissionValueType;
  isOwner?: boolean;
  permissionList?: PermissionListType;
  childUpdatePermissionCallback?: () => void;
};

// the Permission helper class
export class Permission {
  value: PermissionValueType;
  isOwner: boolean = false;
  hasManagePer: boolean = false;
  hasWritePer: boolean = false;
  hasReadPer: boolean = false;
  _permissionList: PermissionListType;

  constructor(props?: PerConstructPros) {
    const { per = NullPermission, isOwner = false, permissionList = PermissionList } = props || {};
    if (isOwner) {
      this.value = OwnerPermissionVal;
    } else {
      this.value = per;
    }

    this._permissionList = permissionList;
    this.updatePermissions();
  }

  // add permission(s)
  // it can be chaining called.
  // @example
  // const perm = new Permission(permission)
  // perm.add(PermissionList['read'])
  // perm.add(PermissionList['read'], PermissionList['write'])
  // perm.add(PermissionList['read']).add(PermissionList['write'])
  addPer(...perList: PermissionValueType[]) {
    if (this.isOwner) {
      return this;
    }
    for (const per of perList) {
      this.value = this.value | per;
    }
    this.updatePermissions();
    return this;
  }

  removePer(...perList: PermissionValueType[]) {
    if (this.isOwner) {
      return this.value;
    }
    for (const per of perList) {
      this.value = this.value & ~per;
    }
    this.updatePermissions();
    return this;
  }

  checkPer(perm: PermissionValueType): boolean {
    // if the permission is owner permission, only owner has this permission.
    if (perm === OwnerPermissionVal) {
      return this.value === OwnerPermissionVal;
    }
    return (this.value & perm) === perm;
  }

  private updatePermissionCallback?: () => void;
  setUpdatePermissionCallback(callback: () => void) {
    callback();
    this.updatePermissionCallback = callback;
  }

  private updatePermissions() {
    this.isOwner = this.value === OwnerPermissionVal;
    this.hasManagePer = this.checkPer(this._permissionList['manage'].value);
    this.hasWritePer = this.checkPer(this._permissionList['write'].value);
    this.hasReadPer = this.checkPer(this._permissionList['read'].value);
    this.updatePermissionCallback?.();
  }

  toBinary() {
    return this.value.toString(2);
  }
}
