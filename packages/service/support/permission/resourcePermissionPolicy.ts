import { ManageRoleVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { getCollaboratorId, sumPer } from '@fastgpt/global/support/permission/utils';

const toPermissionCollaborator = (collaborator: CollaboratorItemType): CollaboratorItemType => {
  if (collaborator.tmbId) {
    return { tmbId: collaborator.tmbId, permission: collaborator.permission };
  }
  if (collaborator.groupId) {
    return { groupId: collaborator.groupId, permission: collaborator.permission };
  }
  if (collaborator.orgId) {
    return { orgId: collaborator.orgId, permission: collaborator.permission };
  }
  throw new Error('A collaborator must have tmbId, groupId, or orgId');
};

const toMap = (collaborators: CollaboratorItemType[]) =>
  new Map(
    collaborators.map((collaborator) => {
      const normalized = toPermissionCollaborator(collaborator);
      return [getCollaboratorId(normalized), normalized];
    })
  );

/** 缺失 inheritPermission 的历史资源按默认值继续继承权限。 */
export const shouldInheritResourcePermission = (inheritPermission?: boolean) =>
  inheritPermission !== false;

/** 将资源 owner 转成从父级继承到子级时使用的 manage。 */
export const toInheritedCollaborators = (collaborators: CollaboratorItemType[]) =>
  collaborators.map((collaborator) => ({
    ...toPermissionCollaborator(collaborator),
    permission: collaborator.permission === OwnerRoleVal ? ManageRoleVal : collaborator.permission
  }));

/**
 * 创建继承权限计算器，复用同一个父级快照对应的 Map。
 * 同一父级下存在大量子资源时，避免为每个子资源重复构造 old/new parent Map。
 */
export const createInheritedResourceCollaboratorCalculator = ({
  oldParentCollaborators,
  newParentCollaborators
}: {
  oldParentCollaborators: CollaboratorItemType[];
  newParentCollaborators: CollaboratorItemType[];
}) => {
  const oldParentMap = toMap(toInheritedCollaborators(oldParentCollaborators));
  const newParentMap = toMap(toInheritedCollaborators(newParentCollaborators));

  return (childCollaborators: CollaboratorItemType[]) => {
    const childMap = toMap(childCollaborators);
    const collaboratorIds = new Set([
      ...oldParentMap.keys(),
      ...newParentMap.keys(),
      ...childMap.keys()
    ]);

    return Array.from(collaboratorIds).flatMap((id) => {
      const child = childMap.get(id);
      const oldParent = oldParentMap.get(id)?.permission ?? 0;
      const newParent = newParentMap.get(id)?.permission ?? 0;
      // Owner 是资源自身角色，即使同一协作者曾从旧父级继承 manage，也要完整保留。
      const childExtra =
        child?.permission === OwnerRoleVal
          ? OwnerRoleVal
          : child
            ? (child.permission & ~oldParent) >>> 0
            : 0;
      const permission = sumPer(newParent, childExtra) ?? 0;

      return permission === 0
        ? []
        : [
            {
              ...(newParentMap.get(id) ?? child ?? oldParentMap.get(id)!),
              permission
            }
          ];
    });
  };
};

/** 合并父级快照和当前资源额外授权，供创建和恢复继承使用。 */
export const mergeResourceCollaborators = ({
  parentCollaborators,
  childCollaborators
}: {
  parentCollaborators: CollaboratorItemType[];
  childCollaborators: CollaboratorItemType[];
}) => {
  const collaborators = toMap(toInheritedCollaborators(parentCollaborators));

  for (const childCollaborator of childCollaborators) {
    const normalizedChild = toPermissionCollaborator(childCollaborator);
    const id = getCollaboratorId(normalizedChild);
    const previous = collaborators.get(id);
    collaborators.set(id, {
      ...normalizedChild,
      permission: previous
        ? sumPer(previous.permission, normalizedChild.permission)!
        : normalizedChild.permission
    });
  }

  return Array.from(collaborators.values());
};

/**
 * 根据父级 old/new 快照重算一个继承资源的完整 ACL。
 * 子级旧 ACL 相对旧父级的独有 bit 会保留，父级撤掉的继承 bit 会被移除。
 */
export const calculateInheritedResourceCollaborators = ({
  oldParentCollaborators,
  newParentCollaborators,
  childCollaborators
}: {
  oldParentCollaborators: CollaboratorItemType[];
  newParentCollaborators: CollaboratorItemType[];
  childCollaborators: CollaboratorItemType[];
}) =>
  createInheritedResourceCollaboratorCalculator({
    oldParentCollaborators,
    newParentCollaborators
  })(childCollaborators);
