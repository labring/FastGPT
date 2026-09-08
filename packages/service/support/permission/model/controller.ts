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

/** 返回成员权限范围内的模型 ID；默认仅启用模型，展示目录可显式包含停用模型。 */
export const getMemberModelCatalogPermission = async ({
  teamId,
  tmbId,
  isTeamOwner,
  includeInactive = false
}: {
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
  /** 仅供目录展示停用状态；执行权限调用仍保持 active 模型范围。 */
  includeInactive?: boolean;
}) => {
  const catalogModels = includeInactive ? global.systemModelList : global.systemActiveModelList;
  if (isTeamOwner) {
    const modelIds = catalogModels.map((model) => model.modelId);
    return { modelIds, version: hashStr([...modelIds].sort().join('\n')) };
  }

  const cacheMetadata = { teamId, tmbId };
  const cachedModels = includeInactive
    ? undefined
    : await getTmpData({
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
  const unconfiguredModels = catalogModels.filter(
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

  // 展示目录不复用可执行模型的权限缓存，避免混入停用模型或命中旧 active 快照。
  if (!includeInactive)
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
