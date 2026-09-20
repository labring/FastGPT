import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByTeam
} from '../resourcePermissionService';
import { getTmpData, setTmpData } from '../../tmpData/controller';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import { isTeamModel, getModelOwnerTmbId } from '@fastgpt/global/core/ai/model';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getModelHandle } from '../../../core/ai/model';
import { authUserPer } from '../user/auth';
import type { AuthModeType } from '../type';

/** 返回成员权限范围内的模型 ID；默认仅启用模型，展示目录可显式包含停用模型。 */
export const getMemberModelCatalogPermission = async ({
  teamId,
  tmbId,
  isTeamOwner,
  catalogSnapshot,
  includeInactive = false
}: {
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
  /** 仅供目录展示停用状态；执行权限调用仍保持 active 模型范围。 */
  includeInactive?: boolean;
  /** 调用方传入同一快照，避免权限计算期间混用目录版本。 */
  catalogSnapshot?: { models: SystemModelDataType[]; revision: number };
}) => {
  const snapshot =
    catalogSnapshot ??
    (await (async () => {
      const handle = await getModelHandle();
      return { models: handle.getAllModels(), revision: handle.revision };
    })());
  const allModels = includeInactive
    ? snapshot.models
    : snapshot.models.filter((model) => model.isActive);
  const catalogRevision = snapshot.revision;

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

  if (isTeamOwner) {
    const modelIds = allModels
      .filter((model) => {
        if (!isTeamModel(model)) return true;
        const ownerTmbId = getModelOwnerTmbId(model);
        return (
          (ownerTmbId && ownerTmbId === tmbId) || permissionConfiguredModelSet.has(model.modelId)
        );
      })
      .map((model) => model.modelId);
    return { modelIds, version: hashStr([...modelIds].sort().join('\n')) };
  }

  const cacheMetadata = { teamId, tmbId };
  const cachedModels = includeInactive
    ? undefined
    : await getTmpData({
        type: TmpDataEnum.MyModels,
        metadata: cacheMetadata
      });
  if (cachedModels && (cachedModels.data.catalogRevision ?? 0) === catalogRevision) {
    return {
      modelIds: cachedModels.data.modelIds,
      version: cachedModels.data.version
    };
  }

  // 1. 系统模型中未配置限定权限的（默认全员可用）
  const unconfiguredSystemModels = allModels.filter(
    (model) => !isTeamModel(model) && !permissionConfiguredModelSet.has(model.modelId)
  );

  // 2. 协作者授权命中的模型（系统模型或被授权的团队私有模型）
  const myCollaboratorModelIds = await findResourceKeysByCollaboratorsPermission({
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

  // 3. 当前成员自己拥有的团队私有模型
  const myOwnedTeamModels = allModels.filter((model) => {
    const ownerTmbId = getModelOwnerTmbId(model);
    return isTeamModel(model) && ownerTmbId === tmbId;
  });

  const modelIds = Array.from(
    new Set([
      ...unconfiguredSystemModels.map((m) => m.modelId),
      ...myCollaboratorModelIds,
      ...myOwnedTeamModels.map((m) => m.modelId)
    ])
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
        version,
        catalogRevision
      }
    });

  return { modelIds, version };
};

/** 返回当前成员可使用的稳定模型 ID。 */
export const getMemberModelIds = async (
  props: Parameters<typeof getMemberModelCatalogPermission>[0]
) => getMemberModelCatalogPermission(props).then((result) => result.modelIds);

/** 校验成员是否拥有模型与渠道管理权限 */
export const assertMemberChannelPermission = (tmbPer: TeamPermission): Promise<void> => {
  if (!tmbPer.hasModelCreatePer) return Promise.reject(ModelErrEnum.unAuthChannel);
  return Promise.resolve();
};

/** 校验成员是否拥有团队私有模型管理权限。 */
export const assertMemberModelPermission = (tmbPer: TeamPermission): Promise<void> => {
  if (!tmbPer.hasModelCreatePer) return Promise.reject(ModelErrEnum.unAuthModel);
  return Promise.resolve();
};

/**
 * 统一的模型/渠道作用域操作鉴权守卫：
 * - 解析登录态与当前成员身份 (tmbId)
 * - system 作用域：仅允许系统管理员 (root) 操作
 */
export const authModelScopeOperation = async ({
  req,
  scope,
  channelType = 'team'
}: {
  req: AuthModeType['req'];
  scope?: 'system' | 'team';
  channelType?: 'system' | 'team';
}) => {
  const resolvedScope = scope ?? channelType ?? 'team';
  const authRes = await authUserPer({ req, authToken: true });

  if (resolvedScope === 'system' && !authRes.isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  return authRes;
};
