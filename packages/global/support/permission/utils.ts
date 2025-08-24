import type { CollaboratorIdType, CollaboratorItemType } from './collaborator';
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
  oldRealClbs,
  newChildClbs
}: {
  parentClbs: CollaboratorItemType[];
  oldRealClbs: CollaboratorItemType[];
  newChildClbs: CollaboratorItemType[];
}): boolean => {
  console.log('checkRoleUpdateConflict', parentClbs, oldRealClbs, newChildClbs);
  if (parentClbs.length === 0) {
    return false;
  }

  // Use a Map for faster lookup by teamId
  const parentClbRoleMap = new Map(parentClbs.map((clb) => [getCollaboratorId(clb), clb]));

  const changedClbs = getChangedCollaborators({
    newRealClbs: newChildClbs,
    oldRealClbs: oldRealClbs
  });

  for (const changedClb of changedClbs) {
    const parent = parentClbRoleMap.get(getCollaboratorId(changedClb));
    if (parent && (changedClb.changedRole & parent.permission) !== 0) {
      return true;
    }
  }

  return false;
};

/**
 * Get changed collaborators.
 * return empty array if all collaborators are unchanged.
 * for each return item: {
 *   id: string; // collaborator id
 *   changedRole: number; // set bit means the role is changed
 * }
 * special: for low 3 bit: always get the lowest change, unset the higher change.
 * @param param0
 */
export const getChangedCollaborators = ({
  oldRealClbs,
  newRealClbs
}: {
  oldRealClbs: CollaboratorItemType[];
  newRealClbs: CollaboratorItemType[];
}) => {
  if (oldRealClbs.length === 0) {
    return newRealClbs.map((clb) => ({
      ...clb,
      changedRole: clb.permission
    }));
  }
  const oldClbsMap = new Map(oldRealClbs.map((clb) => [getCollaboratorId(clb), clb]));
  const changedClbs = [];
  for (const newClb of newRealClbs) {
    const oldClb = oldClbsMap.get(getCollaboratorId(newClb));
    if (!oldClb) {
      changedClbs.push({
        ...newClb,
        changedRole: newClb.permission
      });
      continue;
    }
    const changedRole = oldClb.permission ^ newClb.permission;
    if (changedRole) {
      changedClbs.push({
        ...newClb,
        changedRole
      });
    }
  }

  for (const oldClb of oldRealClbs) {
    const newClb = newRealClbs.find((clb) => getCollaboratorId(clb) === getCollaboratorId(oldClb));
    if (!newClb) {
      changedClbs.push({
        ...oldClb,
        changedRole: oldClb.permission,
        deleted: true
      });
    }
  }

  changedClbs.forEach((clb) => {
    // For the lowest 3 bits, only keep the lowest set bit as 1, clear other lower bits, keep higher bits unchanged
    const low3 = clb.changedRole & 0b111;
    const lowestBit = low3 & -low3;
    clb.changedRole = (clb.changedRole & ~0b111) | lowestBit;
  });

  return changedClbs;
};

export const getCollaboratorId = (clb: CollaboratorIdType) =>
  (clb.tmbId || clb.groupId || clb.orgId)!;
