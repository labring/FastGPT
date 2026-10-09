import type {
  CollaboratorItemType,
  CollaboratorItemDetailType
} from '@fastgpt/global/support/permission/collaborator';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getTeamModelHandle } from '../../../core/ai/model/index';
import { getClbsInfo } from '../controller';
import { resourcePermissionRepo } from '../repository/resourcePermissionRepo';
import { authModelCollaboratorRead, canReadModelCollaborators, type ModelActor } from './policy';

/**
 * 单条与批量协作者读取共用查询：在同一模型快照内校验可见性，再批量读取 ACL 与主体信息。
 * 单条读取拒绝不可见模型，批量展示保留空项以隐藏其他成员私有模型的存在。
 */
export const getModelCollaboratorLists = async ({
  actor,
  modelIds,
  requireAll = false
}: {
  actor: ModelActor;
  modelIds: string[];
  requireAll?: boolean;
}) => {
  const result: Record<string, { clbs: CollaboratorItemDetailType[] }> = {};
  const handle = await getTeamModelHandle({ teamId: actor.teamId });
  const accessible = await Promise.all(
    [...new Set(modelIds)].map(async (id) => {
      result[id] = { clbs: [] };
      const props = { ...actor, model: handle.findModelData({ modelId: id }) };
      if (requireAll) {
        await authModelCollaboratorRead(props);
        return id;
      }
      return (await canReadModelCollaborators(props)) ? id : undefined;
    })
  );
  const resourceIds = accessible.filter((id): id is string => id !== undefined);
  if (resourceIds.length === 0) return result;

  const permissions = await resourcePermissionRepo.findByResourceIds({
    teamId: actor.teamId,
    resourceType: PerResourceTypeEnum.model,
    resourceIds
  });
  const items: CollaboratorItemType[] = [];
  const ids: string[] = [];
  for (const permission of permissions) {
    const collaborator = permission.tmbId
      ? { tmbId: String(permission.tmbId) }
      : permission.groupId
        ? { groupId: String(permission.groupId) }
        : permission.orgId
          ? { orgId: String(permission.orgId) }
          : undefined;
    if (!collaborator || !permission.resourceId) continue;
    items.push({ ...collaborator, permission: permission.permission });
    ids.push(String(permission.resourceId));
  }
  if (items.length === 0) return result;

  const details = await getClbsInfo({ clbs: items, teamId: actor.teamId });
  details.forEach((detail, index) => {
    if (result[ids[index]]) result[ids[index]].clbs.push(detail);
  });
  return result;
};
