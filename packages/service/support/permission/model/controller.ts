import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByTeam
} from '../resourcePermissionService';
import { isProVersion } from '../../../common/system/constants';

export const getMyModels = async ({
  teamId,
  tmbId,
  isTeamOwner
}: {
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
}) => {
  if (isTeamOwner || !isProVersion()) {
    return global.systemModelList.map((m) => m.model);
  }
  const [groups, orgs] = await Promise.all([
    getGroupsByTmbId({
      teamId,
      tmbId
    }),
    getOrgsByTmbId({
      teamId,
      tmbId
    })
  ]);

  const rps = await getResourcePermissionsByTeam({
    teamId,
    resourceType: PerResourceTypeEnum.model
  });

  // 未配置权限的，默认是有权限
  const permissionConfiguredModelSet = new Set(rps.map((rp) => rp.resourceName));
  const unconfiguredModels = global.systemModelList.filter(
    (model) => !permissionConfiguredModelSet.has(model.model)
  );

  const myModels = await findResourceKeysByCollaboratorsPermission({
    teamId,
    resourceType: PerResourceTypeEnum.model,
    tmbId,
    groupIds: groups.map((group) => String(group._id)),
    orgIds: orgs.map((org) => String(org.orgId)),
    permission: ReadPermissionVal,
    matchLogic: 'or',
    // 保持 model 旧逻辑：任一匹配 collaborator 授权即可。
    personalPermissionPriority: false
  });

  return [...unconfiguredModels.map((m) => m.model), ...myModels];
};
