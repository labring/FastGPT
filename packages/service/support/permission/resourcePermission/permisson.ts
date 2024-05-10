// PermissionValueType, the type of permission's value is a number, which is a bit field actually.
// It is spired by the permission system in Linux.
// The lowest 3 bits present the permission of reading, writing and managing.
// The higher bits are advanced permissions or extended permissions, which could be customized.
export type PermissionValueType = number;
export type PermissionType = [string, PermissionValueType];

export const ReadPerm: PermissionType = ['Read', 0b100];
export const WritePerm: PermissionType = ['Write', 0b010];
export const ManagePerm: PermissionType = ['Manage', 0b001];

// list of permissions. could be customized.
// ! removal of the basic permissions is not recommended.
const PermList: Array<PermissionType> = [ReadPerm, WritePerm, ManagePerm];

// return the list of permissions
// @param Perm(optional): the list of permissions to be added
export function getPermList(Perm?: PermissionType[]): Array<PermissionType> {
  if (Perm === undefined) {
    return PermList;
  } else {
    return PermList.concat(Perm);
  }
}

// check the permission
export function checkPermission(val: PermissionValueType, perm: PermissionType): boolean {
  return (val & perm[1]) === perm[1];
}

// add the permission
export function addPermission(val: PermissionValueType, perm: PermissionType): PermissionValueType {
  return val | perm[1];
}

// remove the permission
export function removePermission(
  val: PermissionValueType,
  perm: PermissionType
): PermissionValueType {
  return val & ~perm[1];
}

export function parsePermission(val: PermissionValueType, list: PermissionType[]) {
  const result: [[string, boolean]] = [] as any;
  list.forEach((perm) => {
    result.push([perm[0], checkPermission(val, perm)]);
  });
  return result;
}

export function hasManage(val: PermissionValueType) {
  return checkPermission(val, ManagePerm);
}

export function hasWrite(val: PermissionValueType) {
  return checkPermission(val, WritePerm);
}

export function hasRead(val: PermissionValueType) {
  return checkPermission(val, ReadPerm);
}
