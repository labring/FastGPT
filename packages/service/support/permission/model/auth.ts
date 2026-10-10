import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { ModelHandle } from '../../../core/ai/model/catalog/handle';
import { getTeamModelHandle } from '../../../core/ai/model/catalog/service';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import { resourcePermissionRepo } from '../repository/resourcePermissionRepo';
import { getMemberModelsCache, setMemberModelsCache } from './cache';

/**
 * 模型鉴权动作。与通用 Read/Write/Manage 位掩码不同，三种动作按模型域规则独立判定，不做包含计算：
 *
 * | action   | 系统模型                                             | 团队模型                               |
 * | -------- | ---------------------------------------------------- | -------------------------------------- |
 * | `use`    | root / 团队管理员；未配置任何 ACL（默认开放）；命中 ACL | 归属成员；命中 ACL                     |
 * | `config` | 仅 root                                              | 归属成员且具备 `hasModelCreatePer`     |
 * | `grant`  | root / 团队管理员                                    | 仅归属成员                             |
 *
 * root 与团队管理员不能使用或管理其他成员的团队模型，这是有意设计。
 */
export type ModelAuthAction =
  /** 使用：在应用、知识库、辅助生成等业务中选择或调用模型。 */
  | 'use'
  /** 配置：查看完整配置、测试连通性、编辑、启停、删除、维护渠道绑定。 */
  | 'config'
  /** 授权：查看和修改模型协作者。 */
  | 'grant';

type MemberModelActor = {
  source?: 'member';
  teamId: string;
  tmbId: string;
  /** 必填，避免调用方遗漏 root 身份后按普通成员计算。 */
  isRoot: boolean;
  /**
   * 团队级权限；HTTP 鉴权已拿到团队成员时直接传入，缺省时内部读取一次。
   * 不要传 authApp / authDataset 返回的资源权限 `permission`。
   */
  teamPermission?: Pick<TeamPermission, 'hasManagePer' | 'hasModelCreatePer'>;
};
/** 外链身份来自服务端保存的发布配置；只允许 `use`，固定按非管理员计算且不读写成员缓存。 */
type OutLinkModelActor = {
  source: 'outLink';
  teamId: string;
  tmbId: string;
};
export type ModelActor = MemberModelActor | OutLinkModelActor;

/** 解析成员的团队能力；root 拥有全部团队能力，其余成员优先复用调用方已读取的团队权限。 */
const getMemberAbility = async (actor: MemberModelActor) => {
  if (actor.isRoot) return { hasManagePer: true, hasModelCreatePer: true };
  const { hasManagePer, hasModelCreatePer } =
    actor.teamPermission ?? (await getTmbInfoByTmbId({ tmbId: actor.tmbId })).permission;
  return { hasManagePer, hasModelCreatePer };
};

/**
 * 计算身份在当前目录快照下可使用（`use`）的完整模型 ID 集合，包含停用模型；启用状态由 typed getter 判断。
 * 成员结果按 catalogVersion + hasManagePer 缓存；外链身份每次实时计算，避免与发布者本人互相覆盖缓存。
 * 存储异常正常抛出，不转换为无权限。
 */
export const getAuthorizedModelIds = async ({
  actor,
  handle
}: {
  actor: ModelActor;
  handle: ModelHandle;
}): Promise<Set<string>> => {
  const { teamId, tmbId } = actor;
  const isOutLink = actor.source === 'outLink';
  const hasManagePer = isOutLink ? false : (await getMemberAbility(actor)).hasManagePer;

  if (!isOutLink) {
    const cached = await getMemberModelsCache({
      teamId,
      tmbId,
      catalogVersion: handle.version,
      hasManagePer
    });
    if (cached) return new Set(cached.modelIds);
  }

  const [groups, orgs, aclList] = await Promise.all([
    getGroupsByTmbId({ teamId, tmbId }),
    getOrgsByTmbId({ teamId, tmbId }),
    resourcePermissionRepo.findByTeam({ teamId, resourceType: PerResourceTypeEnum.model })
  ]);
  const groupIds = new Set(groups.map((group) => String(group._id)));
  const orgIds = new Set(orgs.map((org) => String(org.orgId)));
  // 配置过任意 ACL 的系统模型不再默认开放。
  const configuredResourceIds = new Set(
    aclList.flatMap((acl) => (acl.resourceId ? [String(acl.resourceId)] : []))
  );
  // 模型沿用任一 collaborator 授权即可的规则：个人、用户组、直属组织任一命中读权限即授权，
  // 不用个人 ACL 覆盖组或组织授权。
  const grantedIds = new Set(
    aclList.flatMap((acl) => {
      if (!acl.resourceId) return [];
      const isHit =
        (acl.tmbId && String(acl.tmbId) === tmbId) ||
        (acl.groupId && groupIds.has(String(acl.groupId))) ||
        (acl.orgId && orgIds.has(String(acl.orgId)));
      return isHit && new Permission({ role: acl.permission }).hasReadPer
        ? [String(acl.resourceId)]
        : [];
    })
  );
  // 团队 handle 只包含系统模型和本团队模型，无需再判断团队归属。
  const authorizedIds = handle
    .getAllModels()
    .filter((model) => {
      if (isTeamModel(model)) return model.tmbId === tmbId || grantedIds.has(model.modelId);
      return (
        hasManagePer || !configuredResourceIds.has(model.modelId) || grantedIds.has(model.modelId)
      );
    })
    .map((model) => model.modelId);

  if (!isOutLink) {
    await setMemberModelsCache({
      teamId,
      tmbId,
      modelIds: authorizedIds,
      catalogVersion: handle.version,
      hasManagePer
    });
  }
  return new Set(authorizedIds);
};

/**
 * 按 action 批量检查模型权限，返回去重后保持输入顺序的无权限 ID，全部通过返回 `[]`。
 * 只用于需要按结果过滤的场景（目录、展示摘要、协作者批量列表、应用资源鉴权）；
 * 其他场景使用 `assertAuthModels`。不存在的 ID 视为无权限，类型和启用状态留给调用方判断。
 * 调用方已有 handle 时必须传入，保证鉴权与后续读取使用同一目录快照。
 */
export const authModels = async ({
  actor,
  modelIds,
  action,
  handle: inputHandle
}: {
  actor: ModelActor;
  modelIds: string[];
  action: ModelAuthAction;
  handle?: ModelHandle;
}): Promise<string[]> => {
  const ids = [...new Set(modelIds)];
  if (ids.length === 0) return [];
  // 外链只代表发布者使用模型，不具备配置和授权能力。
  if (actor.source === 'outLink' && action !== 'use') return ids;

  const handle = inputHandle ?? (await getTeamModelHandle({ teamId: actor.teamId }));

  if (actor.source === 'outLink' || action === 'use') {
    const authorizedIds = await getAuthorizedModelIds({ actor, handle });
    return ids.filter((modelId) => !authorizedIds.has(modelId));
  }

  const { hasManagePer, hasModelCreatePer } = await getMemberAbility(actor);
  return ids.filter((modelId) => {
    const model = handle.findModelData({ modelId });
    if (!model) return true;

    if (isTeamModel(model)) {
      const isOwner = model.tmbId === actor.tmbId;
      return action === 'config' ? !(isOwner && hasModelCreatePer) : !isOwner;
    }
    // 系统模型配置只能由 root 修改；授权可由团队管理员维护。
    return action === 'config' ? !actor.isRoot : !hasManagePer;
  });
};

/**
 * 断言全部模型具备 action 权限，失败抛 `UserError`：`config` 抛 `unExist`（不暴露模型是否存在），
 * `use` / `grant` 抛 `unAuthModel`。通过时返回同一快照的 handle 和按输入顺序去重解析的模型，
 * 调用方应复用该 handle 读取 typed 模型，不再重复调用 `getTeamModelHandle`。
 */
export const assertAuthModels = async ({
  actor,
  modelIds,
  action,
  handle: inputHandle
}: {
  actor: ModelActor;
  modelIds: string[];
  action: ModelAuthAction;
  handle?: ModelHandle;
}): Promise<{ handle: ModelHandle; models: AIModelDataType[] }> => {
  const handle = inputHandle ?? (await getTeamModelHandle({ teamId: actor.teamId }));
  const deniedIds = await authModels({ actor, modelIds, action, handle });
  if (deniedIds.length > 0) {
    throw new UserError(action === 'config' ? ModelErrEnum.unExist : ModelErrEnum.unAuthModel);
  }

  // 无权限判断已排除不存在的 ID，这里只做类型收窄。
  const models = [...new Set(modelIds)].flatMap((modelId) => {
    const model = handle.findModelData({ modelId });
    return model ? [model] : [];
  });
  return { handle, models };
};
