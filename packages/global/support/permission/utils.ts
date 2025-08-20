import type { CollaboratorItemType } from './collaborator';
import { type PermissionValueType } from './type';
/**
 * Sum the permission value.
 * If no permission value is provided, return undefined to fallback to default value.
 * @param per permission value (number)
 * @returns sum of permission value
 */
export const sumPer = (...per: PermissionValueType[]) => {
  if (per.length === 0) {
    // prevent sum 0 value, to fallback to default value
    return undefined;
  }
  return per.reduce((acc, cur) => acc | cur, 0);
};

/**
 * Check if the update cause conflict (need to remove inheritance permission).
 * Conflict condition:
 * The updated collaborator is a parent collaborator.
 * @param parentClbs parent collaborators
 * @param oldChildClbs old child collaborators
 * @param newChildClbs new child collaborators
 */
export const checkRoleUpdateConflict = ({
  parentClbs,
  oldChildClbs,
  newChildClbs
}: {
  parentClbs: CollaboratorItemType[];
  oldChildClbs: CollaboratorItemType[];
  newChildClbs: CollaboratorItemType[];
}): boolean => {
  if (parentClbs.length === 0) {
    return false;
  }

  // 1. find out which collaborator is changed
  // Use a Map for faster lookup by teamId
  const [oldClbRoleMap, parentClbRoleMap] = [
    new Map(oldChildClbs.map((clb) => [clb.tmbId || clb.groupId || clb.orgId, clb.permission])),
    new Map(parentClbs.map((clb) => [clb.tmbId || clb.groupId || clb.orgId, clb.permission]))
  ];

  for (const newClb of newChildClbs) {
    const key = newClb.tmbId || newClb.groupId || newClb.orgId;
    if (!key) continue;

    const oldPermission = oldClbRoleMap.get(key);

    if (oldPermission === newClb.permission) continue;

    const changedPermission =
      oldPermission !== undefined
        ? oldPermission.role ^ newClb.permission.role
        : newClb.permission.role;

    const parentPermission = parentClbRoleMap.get(key);
    if (parentPermission && (changedPermission & parentPermission.role) !== 0) {
      return true;
    }
  }

  return false;
};
