// PermissionValueType, the type of permission's value is a number, which is a bit field actually.
// It is spired by the permission system in Linux.
// The lowest 3 bits present the permission of reading, writing and managing.
// The higher bits are advanced permissions or extended permissions, which could be customized.
export type PermissionValueType = number;
export type PermissionListType = { [key: string]: PermissionValueType };
export const NullPermission: PermissionValueType = 0;

// the Permission helper class
export class Permission {
  value: PermissionValueType;
  constructor(value: PermissionValueType) {
    this.value = value;
  }

  // add permission(s)
  // it can be chaining called.
  // @example
  // const perm = new Permission(permission)
  // perm.add(PermissionList['read'])
  // perm.add(PermissionList['read'], PermissionList['write'])
  // perm.add(PermissionList['read']).add(PermissionList['write'])
  add(...perm: PermissionValueType[]): Permission {
    for (let p of perm) {
      this.value = addPermission(this.value, p);
    }
    return this;
  }

  remove(...perm: PermissionValueType[]): Permission {
    for (let p of perm) {
      this.value = removePermission(this.value, p);
    }
    return this;
  }

  check(perm: PermissionValueType): Permission | boolean {
    if (checkPermission(this.value, perm)) {
      return this;
    } else {
      return false;
    }
  }
}

export function constructPermission(permList: PermissionValueType[]) {
  return new Permission(NullPermission).add(...permList);
}

// The base Permissions List
// It can be extended, for example:
// export const UserPermissionList: PermissionListType = {
//   ...PermissionList,
//   'Invite': 0b1000
// }
export const PermissionList: PermissionListType = {
  Read: 0b100,
  Write: 0b010,
  Manage: 0b001
};

// list of permissions. could be customized.
// ! removal of the basic permissions is not recommended.
// const PermList: Array<PermissionType> = [ReadPerm, WritePerm, ManagePerm];

// return the list of permissions
// @param Perm(optional): the list of permissions to be added
// export function getPermList(Perm?: PermissionType[]): Array<PermissionType> {
//   if (Perm === undefined) {
//     return PermList;
//   } else {
//     return PermList.concat(Perm);
//   }
// }

// check the permission
// @param [val]: The permission value to be checked
// @parma [perm]: Which Permission value will be checked
// @returns [booean]: if the [val] has the [perm]
// example:
// const perm = user.permission // get this permisiion from db or somewhere else
// const ok = checkPermission(perm, PermissionList['Read'])
export function checkPermission(val: PermissionValueType, perm: PermissionValueType): boolean {
  return (val & perm) === perm;
}

// add the permission
// it can be chaining called.
// return the new permission value based on [val] added with [perm]
// @param val: PermissionValueType
// @param perm: PermissionValueType
// example:
// const basePerm = 0b001; // Manage only
export function addPermission(
  val: PermissionValueType,
  perm: PermissionValueType
): PermissionValueType {
  return val | perm;
}

// remove the permission
export function removePermission(
  val: PermissionValueType,
  perm: PermissionValueType
): PermissionValueType {
  return val & ~perm;
}

// export function parsePermission(val: PermissionValueType, list: PermissionValueType[]) {
//   const result: [[string, boolean]] = [] as any;
//   list.forEach((perm) => {
//     result.push([perm[0], checkPermission(val, perm)]);
//   });
//   return result;
// }

export function hasManage(val: PermissionValueType) {
  return checkPermission(val, PermissionList['Manage']);
}

export function hasWrite(val: PermissionValueType) {
  return checkPermission(val, PermissionList['Write']);
}

export function hasRead(val: PermissionValueType) {
  return checkPermission(val, PermissionList['Read']);
}
