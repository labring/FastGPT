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
import { hashStr } from '@fastgpt/global/common/string/tools';

const myModelsCacheFilter = {
  dataId: { $regex: new RegExp(`^${TmpDataEnum.MyModels}--`) }
};

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
      ...myModelsCacheFilter,
      'data.teamId': teamId,
      'data.tmbId': { $exists: true }
    },
    { session }
  );

/** 模型新增、启用、停用或删除后，删除所有成员的模型列表缓存。 */
export const clearAllMyModelsCache = ({ session }: { session?: ClientSession } = {}) =>
  MongoTmpData.deleteMany(myModelsCacheFilter, { session });

/** 返回当前成员可使用的稳定模型 ID；模型权限只按 resourceId 判断。 */
export const getMemberModelCatalogPermission = async ({
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
    const modelIds = activeModels.map((model) => model.modelId);
    return { modelIds, version: hashStr([...modelIds].sort().join('\n')) };
  }

  const cacheMetadata = { teamId, tmbId };
  const cachedModels = await getTmpData({
    type: TmpDataEnum.MyModels,
    metadata: cacheMetadata
  });
  if (cachedModels) {
    return {
      modelIds: cachedModels.data.modelIds,
      version: cachedModels.data.version
    };
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
  const getPermissionModelId = (permission: (typeof rps)[number]) =>
    permission.resourceId ? String(permission.resourceId) : undefined;
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
  const version = hashStr([...modelIds].sort().join('\n'));

  await setTmpData({
    type: TmpDataEnum.MyModels,
    metadata: cacheMetadata,
    data: {
      teamId,
      tmbId,
      modelIds,
      version
    }
  }).catch(() => {});

  return { modelIds, version };
};

/** 返回当前成员可使用的稳定模型 ID。 */
export const getMemberModelIds = async (
  props: Parameters<typeof getMemberModelCatalogPermission>[0]
) => getMemberModelCatalogPermission(props).then((result) => result.modelIds);
