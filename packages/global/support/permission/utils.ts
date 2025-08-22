import { getClientBuildManifest } from 'next/dist/client/route-loader';
import type {
  CollaboratorIdType,
  CollaboratorItemDetailType,
  CollaboratorItemType
} from './collaborator';
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

  // Use a Map for faster lookup by teamId
  const parentClbRoleMap = new Map(parentClbs.map((clb) => [getCollaboratorId(clb), clb]));

  const changedClbs = getChangedCollaborators({
    newClbs: newChildClbs,
    oldClbs: oldChildClbs
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
 * @param param0
 */
export const getChangedCollaborators = ({
  oldClbs,
  newClbs
}: {
  oldClbs: CollaboratorItemType[];
  newClbs: CollaboratorItemType[];
}) => {
  if (oldClbs.length === 0) {
    return newClbs.map((clb) => ({
      ...clb,
      changedRole: clb.permission
    }));
  }
  const oldClbsMap = new Map(oldClbs.map((clb) => [getCollaboratorId(clb), clb]));
  const changedClbs = [];
  for (const newClb of newClbs) {
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

  for (const oldClb of oldClbs) {
    const newClb = newClbs.find((clb) => getCollaboratorId(clb) === getCollaboratorId(oldClb));
    if (!newClb) {
      changedClbs.push({
        ...oldClb,
        changedRole: oldClb.permission,
        deleted: true
      });
    }
  }

  return changedClbs;
};

export const getCollaboratorId = (clb: CollaboratorIdType) =>
  (clb.tmbId || clb.groupId || clb.orgId)!;
