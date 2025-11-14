import type { CollaboratorIdType, CollaboratorItemType } from './collaborator';
import { ManageRoleVal, OwnerRoleVal } from './constant';
import type { RoleValueType } from './type';
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
  const res = per.reduce((acc, cur) => acc | cur, 0);
  if (res < 0) {
    // overflowed
    return OwnerRoleVal;
  }
  return res;
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
  newChildClbs
}: {
  parentClbs: CollaboratorItemType[];
  newChildClbs: CollaboratorItemType[];
}): boolean => {
  if (parentClbs.length === 0) {
    return false;
  }

  // Use a Map for faster lookup by teamId
  const parentClbRoleMap = new Map(
    parentClbs.map((clb) => [
      getCollaboratorId(clb),
      {
        ...clb
      }
    ])
  );

  const changedClbs = getChangedCollaborators({
    newRealClbs: newChildClbs,
    oldRealClbs: parentClbs
  });

  for (const changedClb of changedClbs) {
    const parent = parentClbRoleMap.get(getCollaboratorId(changedClb));
    if (parent && ((changedClb.changedRole & parent.permission) !== 0 || changedClb.deleted)) {
      return true;
    }
  }

  return false;
};

export type ChangedClbType = {
  changedRole: RoleValueType;
  deleted: boolean;
} & CollaboratorIdType;

/**
 * Get changed collaborators.
 * return empty array if all collaborators are unchanged.
 *
 * for each return item:
 * ```typescript
 * {
 *   // ... ids
 *   changedRole: number; // set bit means the role is changed
 *   deleted: boolean; // is deleted
 * }
 * ```
 *
 * **special**: for low 3 bit: always get the lowest change, unset the higher change.
 */
export const getChangedCollaborators = ({
  oldRealClbs,
  newRealClbs
}: {
  oldRealClbs: CollaboratorItemType[];
  newRealClbs: CollaboratorItemType[];
}): ChangedClbType[] => {
  if (oldRealClbs.length === 0) {
    return newRealClbs.map((clb) => ({
      ...clb,
      changedRole: clb.permission,
      deleted: false
    }));
  }
  const oldClbsMap = new Map(oldRealClbs.map((clb) => [getCollaboratorId(clb), clb]));
  const changedClbs: ChangedClbType[] = [];
  for (const newClb of newRealClbs) {
    const oldClb = oldClbsMap.get(getCollaboratorId(newClb));
    if (!oldClb) {
      changedClbs.push({
        ...newClb,
        changedRole: newClb.permission,
        deleted: false
      });
      continue;
    }
    const changedRole = oldClb.permission ^ newClb.permission;
    if (changedRole) {
      changedClbs.push({
        ...newClb,
        changedRole,
        deleted: false
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

export const mergeCollaboratorList = <T extends CollaboratorItemType>({
  parentClbs,
  childClbs
}: {
  parentClbs: T[];
  childClbs: T[];
}) => {
  const idToClb = new Map<string, T>();

  // Add all items from list1
  for (const parentClb of parentClbs) {
    if (parentClb.permission === OwnerRoleVal) {
      idToClb.set(getCollaboratorId(parentClb), { ...parentClb, permission: ManageRoleVal });
      continue;
    }
    idToClb.set(getCollaboratorId(parentClb), { ...parentClb });
  }

  // Merge permissions from list2
  for (const childClb of childClbs) {
    const id = getCollaboratorId(childClb);
    if (idToClb.has(id)) {
      // If already exists, merge permission bits
      const original = idToClb.get(id)!;
      idToClb.set(id, {
        ...original,
        permission: sumPer(original.permission, childClb.permission)!
      });
    } else {
      idToClb.set(id, { ...childClb });
    }
  }

  return Array.from(idToClb.values());
};
