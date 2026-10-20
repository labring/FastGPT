import { authOutLink } from '@/service/support/permission/auth/outLink';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { scopeToChannelType } from '@fastgpt/global/core/ai/model/utils';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamModelCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { assertTeamModelEnabled } from '@fastgpt/service/core/ai/model/utils';
import { assertAuthModels, type ModelActor } from '@fastgpt/service/support/permission/model/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

/**
 * 模型目录和展示摘要共用的身份解析。
 * 外链身份只取服务端保存的发布配置，返回 `source: 'outLink'`，按发布者的使用权计算且不读写成员缓存。
 */
export const authModelViewer = async ({
  req,
  outLinkAuthData
}: {
  req: ApiRequestProps;
  outLinkAuthData?: OutLinkChatAuthProps;
}): Promise<ModelActor> => {
  if (outLinkAuthData) {
    const { outLinkConfig } = await authOutLink({ ...outLinkAuthData, req });
    return {
      source: 'outLink',
      teamId: String(outLinkConfig.teamId),
      tmbId: String(outLinkConfig.tmbId)
    };
  }
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });
  return { teamId, tmbId, isRoot, teamPermission: tmb.permission };
};

/**
 * 模型 / 渠道管理入口的作用域鉴权（创建模型、模板、配置列表、草稿测试、全部渠道接口）。
 * - system：仅 root。
 * - team：需要团队“安装模型”权限，且商业版团队模型功能已开启。
 * 只判断入口能力；具体模型的归属由 `authModelConfig` 判定，渠道归属由服务端按会话 tmbId 推导的分组保证。
 */
export const authModelScope = async ({
  req,
  channelType
}: {
  req: ApiRequestProps;
  channelType: ChannelType;
}) => {
  const isTeam = channelType === 'team';
  const { teamId, tmbId, isRoot } = await authUserPer({
    req,
    authToken: true,
    per: isTeam ? TeamModelCreatePermissionVal : undefined
  });
  if (isTeam) await assertTeamModelEnabled();
  else if (!isRoot) throw ModelErrEnum.rootOnlyPermit;
  return { teamId, tmbId };
};

/**
 * 模型配置类路由（详情、测试、编辑、启停、删除、渠道绑定）的统一鉴权入口。
 * 1. 登录鉴权并校验 `config` 权限，无权限与不存在统一按 `unExist` 处理，避免探测模型。
 * 2. 请求声明的 channelType 必须与每个模型的实际 scope 一致，防止借系统入口操作团队模型或反之。
 * 3. 按模型实际 scope 判断团队模型能力，不信任客户端声明。
 * 返回同一目录快照的 handle 和已解析模型，路由不需要再读取目录。
 */
export const authModelConfig = async ({
  req,
  modelIds,
  channelType
}: {
  req: ApiRequestProps;
  modelIds: string[];
  channelType: ChannelType;
}) => {
  // 1. 登录鉴权 + 配置权限
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({ req, authToken: true });
  const actor = { teamId, tmbId, isRoot, teamPermission: tmb.permission };
  const { handle, models } = await assertAuthModels({ actor, modelIds, action: 'config' });

  // 2. 作用域一致性
  if (models.some((model) => scopeToChannelType(model.scope) !== channelType)) {
    throw new UserError(ModelErrEnum.unExist);
  }

  // 3. 上一步已保证 channelType 与模型实际 scope 一致
  if (channelType === 'team') await assertTeamModelEnabled();

  return { actor, handle, models };
};
