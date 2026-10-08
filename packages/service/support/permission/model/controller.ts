import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import {
  findResourceKeysByCollaboratorsPermission,
  getResourcePermissionsByTeam
} from '../resourcePermissionService';
import { getTmbPermission } from '../controller';
import { getTmpData, setTmpData } from '../../tmpData/controller';
import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constants';
import { isSystemModel, isTeamModel, scopeToChannelType } from '@fastgpt/global/core/ai/model';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getModelHandle } from '../../../core/ai/model';
import { getTeamModelsByTeamId } from '../../../core/ai/model/teamModelCache';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { isProVersion } from '../../../common/system/constants';
import { authSystemAdmin, authUserPer } from '../user/auth';
import type { AuthModeType } from '../type';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/model/channel/api';

/** 返回成员权限范围内的模型 ID；默认仅启用模型，展示目录可显式包含停用模型。 */
export const getMemberModelCatalogPermission = async ({
  teamId,
  tmbId,
  isTeamOwner: _isTeamOwner,
  catalogSnapshot,
  includeInactive = false
}: {
  teamId: string;
  tmbId: string;
  isTeamOwner?: boolean;
  /** 仅供目录展示停用状态；执行权限调用仍保持 active 模型范围。 */
  includeInactive?: boolean;
  /** 调用方传入同一快照，避免权限计算期间混用目录版本。 */
  catalogSnapshot?: { models: SystemModelDataType[]; revision: number };
}) => {
  const snapshot =
    catalogSnapshot ??
    (await (async () => {
      const handle = await getModelHandle({ teamId });
      return { models: handle.getAllModels(), revision: handle.revision };
    })());
  const catalogRevision = snapshot.revision;

  // 优先尝试命中成员模型权限缓存，命中时直接返回，无需额外查询团队模型、组织架构及权限记录
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

  // 缓存未命中时，按需合并团队模型并执行完整鉴权计算
  const teamModels = await getTeamModelsByTeamId(teamId);
  const existingModelIds = new Set(snapshot.models.map((m) => m.modelId));
  const missingTeamModels = teamModels.filter((m) => !existingModelIds.has(m.modelId));
  const fullModels = [...snapshot.models, ...missingTeamModels];
  const allModels = includeInactive ? fullModels : fullModels.filter((model) => model.isActive);

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

  // 1. 系统模型中未配置限定权限的（默认全员可用）
  const unconfiguredSystemModels = allModels.filter(
    (model) => !isTeamModel(model) && !permissionConfiguredModelSet.has(model.modelId)
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
      ...unconfiguredSystemModels.map((m) => m.modelId),
      ...myCollaboratorModelIds,
      ...myOwnedTeamModels.map((m) => m.modelId)
    ])
  );

  const visibleTeamModels = allModels
    .filter((model) => isTeamModel(model) && modelIds.includes(model.modelId))
    .map((model) => ({
      modelId: model.modelId,
      name: model.name,
      model: model.model,
      avatar: model.avatar,
      config: model.config,
      charsPointsPrice: model.charsPointsPrice,
      priceTiers: model.priceTiers
    }));

  const version = hashStr(
    [
      ...modelIds.sort(),
      String(catalogRevision),
      JSON.stringify(visibleTeamModels.sort((a, b) => a.modelId.localeCompare(b.modelId)))
    ].join('\n')
  );

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

/**
 * 校验成员是否拥有模型/渠道管理权限（TeamModelCreatePermission）。
 * 模型与渠道共用同一权限位，仅错误码按资源区分，便于前端提示。
 */
export const assertMemberModelPermission = (
  tmbPer: TeamPermission,
  resource: 'model' | 'channel' = 'model'
): Promise<void> => {
  if (!tmbPer.hasModelCreatePer) {
    return Promise.reject(
      resource === 'channel' ? ModelErrEnum.unAuthChannel : ModelErrEnum.unAuthModel
    );
  }
  return Promise.resolve();
};

/**
 * 团队模型/渠道是商业版能力：开源版即使绕过前端直接调用接口，也要在服务端拒绝。
 * system 作用域是各版本共有的管理员能力，不经过这里。
 */
const assertTeamModelEnabled = (): Promise<void> =>
  isProVersion() ? Promise.resolve() : Promise.reject(SystemErrEnum.commercialFeature);

/**
 * 模型/渠道接口的作用域鉴权守卫（不含成员管理权限，权限校验见 authModelManage）：
 * - 解析登录态与当前成员身份 (tmbId)
 * - system 作用域：仅允许系统管理员 (root) 操作
 * - team 作用域：仅商业版可用，数据始终绑定当前成员
 */
export const authModelScopeOperation = async ({
  req,
  channelType = 'team'
}: {
  req: AuthModeType['req'];
  channelType?: ChannelType;
}) => {
  const authRes = await authUserPer({ req, authToken: true });

  if (channelType === 'system' && !authRes.isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }
  if (channelType === 'team') await assertTeamModelEnabled();

  return authRes;
};

/**
 * 模型管理台接口（读写）的统一鉴权守卫，在作用域校验之上追加成员的管理权限校验：
 * root 不受限；普通成员操作 team 作用域时必须拥有 hasModelCreatePer（只看 Per，不看 Role）。
 * 所有管理台的模型/渠道/日志/监控接口都应使用它，避免各 handler 各自拼装权限判断而遗漏。
 */
export const authModelManage = async ({
  req,
  channelType = 'team',
  resource = 'model'
}: {
  req: AuthModeType['req'];
  channelType?: ChannelType;
  resource?: 'model' | 'channel';
}) => {
  const authRes = await authModelScopeOperation({ req, channelType });
  if (!authRes.isRoot) {
    await assertMemberModelPermission(authRes.tmb.permission, resource);
  }
  return authRes;
};

/**
 * 按具体模型实例鉴权（详情读取、连通性测试等针对单个模型的接口）：
 * - team 模型：需要登录成员；非 root 还需 hasModelCreatePer。模型已有归属时只允许归属成员访问，
 *   即使是 root 也不能越权读取或测试其他成员的私有模型，且对外统一表现为「模型不存在」。
 * - system 模型：仅 root。
 * 返回的 ownerTmbId 是本次操作应使用的成员桶（模型归属成员，草稿模型回退为当前成员）。
 */
export const authModelInstanceAccess = async ({
  req,
  model,
  isTeam = isTeamModel(model),
  resource = 'model'
}: {
  req: AuthModeType['req'];
  model: { tmbId?: string | null; scope?: string; isSystem?: boolean; teamId?: string | null };
  /** 默认由模型自身 scope 推导；调用方可显式声明（如请求已指定 channelType=team）。 */
  isTeam?: boolean;
  resource?: 'model' | 'channel';
}): Promise<{ teamId: string; tmbId: string; ownerTmbId?: string }> => {
  if (!isTeam) {
    const { teamId, tmbId } = await authSystemAdmin({ req });
    return { teamId, tmbId };
  }

  const { teamId, tmbId, tmb, isRoot } = await authUserPer({ req, authToken: true });
  await assertTeamModelEnabled();
  if (!isRoot) await assertMemberModelPermission(tmb.permission, resource);

  if (model.teamId && model.teamId !== teamId) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  if (model.tmbId && model.tmbId !== tmbId) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  return { teamId, tmbId, ownerTmbId: model.tmbId || tmbId };
};

/**
 * 统一的模型实例获取与操作权限守卫：
 * 1. 按 channelType 执行会话登录态与作用域合法性校验；
 * 2. 基于解析出的团队上下文（teamId）安全加载 Scoped ModelHandle，避免跨团队/未授权模型探测；
 * 3. 定位模型并校验作用域匹配（若指定了 channelType，必须与模型自身的 scope 严格匹配）；
 * 4. 执行模型实例级归属与权限校验（团队模型仅允许当前团队创建者访问，禁止跨团队或跨成员探测）；
 * 5. 返回统一的租户与模型数据对象。
 */
export const authAndGetModelInstance = async ({
  req,
  modelId,
  channelType,
  resource = 'model'
}: {
  req: AuthModeType['req'];
  modelId: string;
  channelType?: ChannelType;
  resource?: 'model' | 'channel';
}): Promise<{
  teamId: string;
  tmbId: string;
  ownerTmbId?: string;
  model: SystemModelDataType;
}> => {
  // 1. 优先校验会话凭证与显式作用域，禁止未认证请求直接打到数据库
  const authRes = await authModelScopeOperation({ req, channelType });
  const { teamId, tmbId, tmb, isRoot } = authRes;

  // 2. 基于解析出的团队上下文（teamId）安全加载 Scoped ModelHandle
  const modelHandle = await getModelHandle({ teamId });
  const model = modelHandle.findModelData({ modelId });

  if (!model) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  // 3. 校验模型作用域是否与请求作用域严格对齐
  if (channelType && channelType !== scopeToChannelType(model.scope)) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  // 4. 执行模型实例级访问与操作权限校验
  const isTeam = isTeamModel(model);
  if (!isTeam) {
    if (!isRoot) return Promise.reject(ModelErrEnum.rootOnlyPermit);
    return { teamId, tmbId, model };
  }

  await assertTeamModelEnabled();
  if (!isRoot) {
    await assertMemberModelPermission(tmb.permission, resource);
  }

  if (!model.teamId || String(model.teamId) !== String(teamId)) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  if (!model.tmbId || String(model.tmbId) !== String(tmbId)) {
    return Promise.reject(ModelErrEnum.unExist);
  }

  return { teamId, tmbId, ownerTmbId: model.tmbId, model };
};

/**
 * 校验指定成员是否有权使用某个模型（执行调用入口统一使用此方法鉴权）。
 * 检查项：
 * 1. 模型是否存在且已启用 (isActive)
 * 2. 如果是团队模型，校验其所属 teamId 必须与当前 teamId 一致
 * 3. 校验该模型在成员的可用模型列表 (getMemberModelIds) 中
 * 若 optional 为 true，任何鉴权失败或模型不存在时不抛出异常，而是返回 undefined。
 */
export async function authModelUse(params: {
  modelId: string;
  tmbId: string;
  teamId: string;
  optional?: false;
}): Promise<SystemModelDataType>;
export async function authModelUse(params: {
  modelId: string;
  tmbId: string;
  teamId: string;
  optional: boolean;
}): Promise<SystemModelDataType | undefined>;
export async function authModelUse({
  modelId,
  tmbId,
  teamId,
  optional = false
}: {
  modelId: string;
  tmbId: string;
  teamId: string;
  optional?: boolean;
}): Promise<SystemModelDataType | undefined> {
  const modelHandle = await getModelHandle({ teamId });
  const modelData = modelHandle.findModelData({ modelId });
  if (!modelData || !modelData.isActive) {
    if (optional) return undefined;
    return Promise.reject(new UserError(ModelErrEnum.unExist));
  }

  if (isTeamModel(modelData)) {
    if (modelData.teamId && modelData.teamId !== teamId) {
      if (optional) return undefined;
      return Promise.reject(new UserError(ModelErrEnum.unAuthModel));
    }
  }

  const allowedModelIds = await getMemberModelIds({
    teamId,
    tmbId,
    includeInactive: false
  });

  if (!allowedModelIds.includes(modelId)) {
    if (optional) return undefined;
    return Promise.reject(new UserError(ModelErrEnum.unAuthModel));
  }

  return modelData;
}

/**
 * 校验当前成员是否有权管理该模型的协作者权限：
 * 1. 系统模型：仅 root 或拥有团队管理权限 (hasManagePer) 的成员可操作
 * 2. 团队私有模型：
 *    - 必须属于当前团队 (teamId 一致)，否则对外视为不存在 (unExist)
 *    - 必须是模型的创建者 (owner) 或拥有该模型的协作者管理权限 (ModelPermission.hasManagePer)
 *    - 管理员和 root 也不能直接越权管理其他成员的私有模型
 */
export const authModelCollaboratorManage = async ({
  model,
  teamId,
  tmbId,
  tmb,
  isRoot
}: {
  model?: SystemModelDataType | null;
  teamId: string;
  tmbId: string;
  tmb: { permission: TeamPermission };
  isRoot?: boolean;
}): Promise<SystemModelDataType> => {
  if (!model) {
    throw new UserError(ModelErrEnum.unExist);
  }

  if (isSystemModel(model)) {
    if (!isRoot && !tmb.permission.hasManagePer) {
      throw new UserError(ModelErrEnum.unAuthModel);
    }
    return model;
  }

  if (isTeamModel(model)) {
    if (model.teamId !== teamId) {
      throw new UserError(ModelErrEnum.unExist);
    }
    const isOwner = model.tmbId === tmbId;
    if (!isOwner) {
      const tmbPer = await getTmbPermission({
        resourceType: PerResourceTypeEnum.model,
        teamId,
        resourceId: model.modelId,
        tmbId
      });
      const modelPer = new ModelPermission({ role: tmbPer, isOwner: false });
      if (!modelPer.hasManagePer) {
        throw new UserError(ModelErrEnum.unExist);
      }
    }
    return model;
  }

  throw new UserError(ModelErrEnum.unExist);
};
