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
import { getTmpData, setTmpData } from '../../tmpData/controller';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import { MongoTmpData } from '../../tmpData/schema';
import type { ClientSession } from '../../../common/mongo';

/** 删除团队下所有成员的模型权限缓存；权限写入成功后无需主动重建。 */
export const clearMyModelsCache = ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) =>
  MongoTmpData.deleteMany(
    {
      'data.teamId': teamId,
      'data.tmbId': { $exists: true }
    },
    { session }
  );

/** 返回当前成员可使用的稳定模型 ID；旧 resourceName 权限会在读取时映射到 modelId。 */
export const getMyModelIds = async ({
  teamId,
  tmbId,
  isTeamOwner
}: {
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
}) => {
  const activeModels = global.systemActiveModelList;
  if (isTeamOwner || !isProVersion()) {
    return activeModels.map((model) => model.modelId);
  }

  const cacheMetadata = { teamId, tmbId };
  const cachedModels = await getTmpData({
    type: TmpDataEnum.MyModels,
    metadata: cacheMetadata
  });
  if (cachedModels) return cachedModels.data.modelIds;

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
  const modelIdByLegacyModel = new Map(activeModels.map((model) => [model.model, model.modelId]));
  const getPermissionModelId = (permission: (typeof rps)[number]) =>
    permission.resourceId
      ? String(permission.resourceId)
      : modelIdByLegacyModel.get(permission.resourceName);
  const permissionConfiguredModelSet = new Set(
    rps.map(getPermissionModelId).filter((modelId): modelId is string => !!modelId)
  );
  const unconfiguredModels = activeModels.filter(
    (model) => !permissionConfiguredModelSet.has(model.modelId)
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

  const modelIds = Array.from(
    new Set([...unconfiguredModels.map((model) => model.modelId), ...myModels])
  );

  await setTmpData({
    type: TmpDataEnum.MyModels,
    metadata: cacheMetadata,
    data: {
      teamId,
      tmbId,
      modelIds
    }
  }).catch(() => {});

  return modelIds;
};
