import {
  assertMemberModelPermission,
  assertTeamModelEnabled,
  assertModelInstancePolicy,
  type ModelInstanceOwner
} from './policy';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { isTeamModel, scopeToChannelType } from '@fastgpt/global/core/ai/model/utils';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { getTeamModelHandle } from '../../../core/ai/model/index';
import { authUserPer } from '../user/auth';
import { getMemberModelIds } from './catalog';
import type { AuthModeType } from '../type';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';

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
 * 草稿模型预览鉴权；已安装模型入口通过 authAndGetModelInstance 使用同一策略：
 * - team 模型：需要登录成员；非 root 还需 hasModelCreatePer。模型已有归属时只允许归属成员访问，
 *   即使是 root 也不能越权读取或测试其他成员的私有模型，且对外统一表现为「模型不存在」。
 * - system 模型：仅 root。
 * 返回的 ownerTmbId 是本次操作应使用的成员桶（模型归属成员，草稿模型回退为当前成员）。
 */
export const authModelInstanceAccess = async ({
  req,
  model,
  resource = 'model'
}: {
  req: AuthModeType['req'];
  model: ModelInstanceOwner;
  resource?: 'model' | 'channel';
}) => {
  const actor = await authUserPer({ req, authToken: true });
  return assertModelInstancePolicy({ model, actor, resource, allowMissingOwner: true });
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
  model: AIModelDataType;
}> => {
  // 显式作用域先校验；旧调用未声明时，按已安装实例的真实归属执行策略。
  const actor = channelType
    ? await authModelScopeOperation({ req, channelType })
    : await authUserPer({ req, authToken: true });
  const modelHandle = await getTeamModelHandle({ teamId: actor.teamId });
  const model = modelHandle.findModelData({ modelId });
  if (!model || (channelType && channelType !== scopeToChannelType(model.scope))) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  const access = await assertModelInstancePolicy({ model, actor, resource });
  return { ...access, model };
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
}): Promise<AIModelDataType>;
export async function authModelUse(params: {
  modelId: string;
  tmbId: string;
  teamId: string;
  optional: boolean;
}): Promise<AIModelDataType | undefined>;
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
}): Promise<AIModelDataType | undefined> {
  const modelHandle = await getTeamModelHandle({ teamId });
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
    includeInactive: false,
    catalogSnapshot: { models: modelHandle.getAllModels(), version: modelHandle.version }
  });

  if (!allowedModelIds.includes(modelId)) {
    if (optional) return undefined;
    return Promise.reject(new UserError(ModelErrEnum.unAuthModel));
  }

  return modelData;
}
