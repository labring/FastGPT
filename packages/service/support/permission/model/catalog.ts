import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import { getTeamModelHandle } from '../../../core/ai/model/index';
import { getTmpData, setTmpData } from '../../tmpData/controller';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByTeam
} from '../resourcePermissionService';

export const getMemberModelCatalogPermission = async ({
  teamId,
  tmbId,
  catalogSnapshot,
  includeInactive = false,
  hasManagePer
}: {
  teamId: string;
  tmbId: string;
  /** 仅供目录展示停用状态；执行权限调用仍保持 active 模型范围。 */
  includeInactive?: boolean;
  /** 调用方传入同一快照，避免权限计算期间混用目录版本。 */
  catalogSnapshot?: { models: AIModelDataType[]; version: string };
  hasManagePer?: boolean;
}) => {
  const snapshot =
    catalogSnapshot ??
    (await (async () => {
      const handle = await getTeamModelHandle({ teamId });
      return { models: handle.getAllModels(), version: handle.version };
    })());
  const catalogVersion = snapshot.version;

  // 优先尝试命中成员模型权限缓存，命中时直接返回，无需额外查询团队模型、组织架构及权限记录
  const cacheMetadata = { teamId, tmbId };
  const cachedModels = includeInactive
    ? undefined
    : await getTmpData({
        type: TmpDataEnum.MyModels,
        metadata: cacheMetadata
      });
  if (cachedModels && cachedModels.data.catalogVersion === catalogVersion) {
    return {
      modelIds: cachedModels.data.modelIds,
      version: cachedModels.data.version
    };
  }

  // 目录层拥有完整快照；权限层只在该版本内投影，绝不另行补读团队模型。
  const scopedModels = snapshot.models.filter(
    (model) => !isTeamModel(model) || model.teamId === teamId
  );
  const allModels = includeInactive ? scopedModels : scopedModels.filter((model) => model.isActive);

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

  // 1. 系统模型：有管理权限 (hasManagePer) 全量可用；普通成员仅未配置限定权限的可用（默认全员可用）
  const visibleSystemModels = allModels.filter(
    (model) =>
      !isTeamModel(model) &&
      (Boolean(hasManagePer) || !permissionConfiguredModelSet.has(model.modelId))
  );

  const allModelsMap = new Map(allModels.map((m) => [m.modelId, m]));

  // 2. 协作者授权命中的模型（系统模型或本团队被授权的团队私有模型）
  const rawCollaboratorModelIds = await findResourceKeysByCollaboratorsPermission({
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
  const myCollaboratorModelIds = rawCollaboratorModelIds.filter((id) => {
    const model = allModelsMap.get(id);
    if (!model) return false;
    if (isTeamModel(model) && model.teamId && model.teamId !== teamId) {
      return false;
    }
    return true;
  });

  // 3. 当前成员自己拥有的团队私有模型
  const myOwnedTeamModels = allModels.filter((model) => {
    return isTeamModel(model) && model.tmbId === tmbId;
  });

  const modelIds = Array.from(
    new Set([
      ...visibleSystemModels.map((m) => m.modelId),
      ...myCollaboratorModelIds,
      ...myOwnedTeamModels.map((m) => m.modelId)
    ])
  );

  const version = hashStr([catalogVersion, ...modelIds.toSorted()].join('\n'));

  // 展示目录不复用可执行模型的权限缓存，避免混入停用模型或命中旧 active 快照。
  if (!includeInactive)
    await setTmpData({
      type: TmpDataEnum.MyModels,
      metadata: cacheMetadata,
      data: {
        teamId,
        tmbId,
        modelIds,
        version,
        catalogVersion
      }
    });

  return { modelIds, version };
};

/** 返回当前成员可使用的稳定模型 ID。 */
export const getMemberModelIds = async (
  props: Parameters<typeof getMemberModelCatalogPermission>[0]
) => getMemberModelCatalogPermission(props).then((result) => result.modelIds);
