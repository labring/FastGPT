import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { isSystemModel, isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { UserError } from '@fastgpt/global/common/error/utils';
import { isProVersion } from '../../../common/system/constants';

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
 * 团队模型/渠道是商业版能力且受功能清单开关控制：
 * 1. 开源版拒绝访问（commercialFeature）
 * 2. 管理员未开启团队模型功能时拒绝访问（teamModelDisabled）
 * system 作用域是各版本共有的管理员能力，不经过这里。
 */
export const assertTeamModelEnabled = (): Promise<void> => {
  if (!isProVersion()) return Promise.reject(SystemErrEnum.commercialFeature);
  if (global.feConfigs?.enable_team_model === false) {
    return Promise.reject(ModelErrEnum.teamModelDisabled);
  }
  return Promise.resolve();
};

export type ModelInstanceOwner = {
  tmbId?: string | null;
  scope?: string;
  isSystem?: boolean;
  teamId?: string | null;
};
export type ModelActor = {
  teamId: string;
  tmbId: string;
  tmb: { permission: TeamPermission };
  isRoot?: boolean;
};

/** 草稿与已安装模型共用的访问策略；仅草稿允许缺少归属并绑定当前成员。 */
export const assertModelInstancePolicy = async ({
  model,
  actor,
  resource,
  allowMissingOwner = false
}: {
  model: ModelInstanceOwner;
  actor: ModelActor;
  resource: 'model' | 'channel';
  allowMissingOwner?: boolean;
}): Promise<{ teamId: string; tmbId: string; ownerTmbId?: string }> => {
  const { teamId, tmbId, isRoot, tmb } = actor;
  if (!isTeamModel(model)) {
    if (!isRoot) return Promise.reject(ModelErrEnum.rootOnlyPermit);
    return { teamId, tmbId };
  }

  await assertTeamModelEnabled();
  if (!isRoot) await assertMemberModelPermission(tmb.permission, resource);
  if (
    (!allowMissingOwner && (!model.teamId || !model.tmbId)) ||
    (model.teamId && String(model.teamId) !== teamId) ||
    (model.tmbId && String(model.tmbId) !== tmbId)
  ) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  return { teamId, tmbId, ownerTmbId: model.tmbId || tmbId };
};

type ModelCollaboratorAccess = ModelActor & { model?: AIModelDataType | null };

/** 团队模型仅允许同团队的模型所有者读取和修改授权名单，协作者授权与 root 均不绕过归属。 */
const canManageTeamModelCollaborators = ({ model, teamId, tmbId }: ModelCollaboratorAccess) =>
  Boolean(model && isTeamModel(model) && model.teamId === teamId && model.tmbId === tmbId);

/**
 * 协作者展示策略供单条与批量列表复用：系统模型可用范围对登录成员公开；
 * 私有模型仅模型所有者可读，协作者只能使用模型，不能查看或管理其他成员的授权。
 */
export const canReadModelCollaborators = async (
  props: ModelCollaboratorAccess
): Promise<boolean> => {
  if (!props.model) return false;
  if (isSystemModel(props.model)) return true;
  return canManageTeamModelCollaborators(props);
};

/** 校验单条协作者读取，与批量展示共用策略；写入仍走独立管理权限入口。 */
export const authModelCollaboratorRead = async (props: ModelCollaboratorAccess) => {
  if (!props.model || !(await canReadModelCollaborators(props))) {
    throw new UserError(ModelErrEnum.unExist);
  }
  return props.model;
};

/** 系统模型授权变更仅允许 root/团队管理员；私有模型仅允许模型所有者。 */
export const authModelCollaboratorManage = async (props: ModelCollaboratorAccess) => {
  const { model, isRoot, tmb } = props;
  if (!model) throw new UserError(ModelErrEnum.unExist);
  if (isSystemModel(model)) {
    if (!isRoot && !tmb.permission.hasManagePer) throw new UserError(ModelErrEnum.unAuthModel);
    return model;
  }
  if (!canManageTeamModelCollaborators(props)) throw new UserError(ModelErrEnum.unExist);
  return model;
};
