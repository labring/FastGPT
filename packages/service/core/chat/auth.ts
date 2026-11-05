import { parseHeaderCert } from '../../support/permission/auth/common';
import type { ChatPublishSourceType } from '@fastgpt/global/core/chat/publishSource/type';
import { assertChatPublishSource } from './publishSource/utils';
import {
  ChatSourceEnum,
  ChatSourceTypeEnum,
  chatSourceResponseOptions
} from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import {
  AuthUserTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';
import type { AuthModeType } from '../../support/permission/type';
import { authApp } from '../../support/permission/app/auth';
import { authSkill } from '../../support/permission/skill/auth';
import { MongoChat } from './chatSchema';
import { buildChatSourceQuery } from './source';
import { authOutLink } from '../../support/permission/publish/authChat';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

/** 已通过资源鉴权的会话访问范围；省略成员表示允许访问该资源下同团队的会话。 */
export type ChatAccessScope = {
  teamId: string;
  tmbId?: string;
};

type ChatTargetAuthParams = AuthModeType & {
  sourceType: ChatSourceTypeEnum;
  sourceId?: string;
  chatId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
};

type AuthChatTargetCrudResult = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  /** 仅返回该来源已经加载的资源；外链鉴权不额外读取完整应用。 */
  app?: Awaited<ReturnType<typeof authApp>>['app'];
  skill?: Awaited<ReturnType<typeof authSkill>>['skill'];
  userId?: string;
  teamId: string;
  tmbId: string;
  uid: string;
  chat?: ChatSchemaType;
  /** 登录成员的访问范围；外链按已验证的 uid 和发布配置限制访问。 */
  scope?: ChatAccessScope;
  publishSource?: ChatPublishSourceType;
  isRoot: boolean;
  authType?: `${AuthUserTypeEnum}`;
  apiKeyType?: ApiKeyTypeEnum;
} & (typeof chatSourceResponseOptions)[ChatSourceTypeEnum];

/** 校验实际记录的归属；先查记录再检查，避免把无权访问的 chatId 当成新会话。 */
export const assertChatAccess = ({
  chat,
  scope
}: {
  chat: Pick<ChatSchemaType, 'teamId' | 'tmbId'>;
  scope: ChatAccessScope;
}): void => {
  if (
    String(chat.teamId) !== String(scope.teamId) ||
    (scope.tmbId !== undefined && String(chat.tmbId) !== String(scope.tmbId))
  ) {
    throw ChatErrEnum.unAuthChat;
  }
};

/**
 * Chat 唯一业务鉴权入口，统一登录用户、API Key 和外链身份，供主站及 Pro 复用。
 * Builder 固定要求写权限且会话限本人；App/Helper 按日志权限决定跨成员访问，Skill 保留团队级访问。
 * 返回 App/Skill 元数据、可信身份、会话、访问范围和展示权限，调用方无需选择另一个入口。
 * 不存在的会话允许后续创建；需要已有会话的操作仍应检查返回的 chat。
 */
export const authChatTargetCrud = async ({
  sourceType,
  sourceId,
  chatId,
  outLinkAuthData,
  per = ReadPermissionVal,
  ...props
}: ChatTargetAuthParams): Promise<AuthChatTargetCrudResult> => {
  /** 资源 ID 已由权限或外链配置确认后再读取会话，空结果保留新会话语义。 */
  const loadChat = async (resolvedSourceId: string) =>
    chatId
      ? ((await MongoChat.findOne({
          ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }),
          chatId
        }).lean()) ?? undefined)
      : undefined;

  if (
    sourceType === ChatSourceTypeEnum.app &&
    outLinkAuthData?.shareId &&
    outLinkAuthData.outLinkUid
  ) {
    const { uid, appId, outLinkConfig } = await authOutLink({ ...outLinkAuthData, req: props.req });
    const resolvedSourceId = String(appId);
    if (sourceId && sourceId !== resolvedSourceId) throw ChatErrEnum.unAuthChat;
    const chat = await loadChat(resolvedSourceId);
    if (chat && chat.outLinkUid !== uid) throw ChatErrEnum.unAuthChat;
    const publishSource = { type: ChatSourceEnum.share, id: String(outLinkConfig._id) };
    if (chat) assertChatPublishSource({ previous: chat.publishSource, current: publishSource });

    return {
      sourceType,
      sourceId: resolvedSourceId,
      teamId: String(outLinkConfig.teamId),
      tmbId: String(outLinkConfig.tmbId),
      uid,
      publishSource,
      chat,
      isRoot: false,
      authType: AuthUserTypeEnum.outLink,
      showCite: outLinkConfig.showCite ?? false,
      showRunningStatus: outLinkConfig.showRunningStatus ?? true,
      showSkillReferences: outLinkConfig.showSkillReferences ?? false,
      showFullText: outLinkConfig.showFullText ?? false,
      canDownloadSource: outLinkConfig.canDownloadSource ?? false
    };
  }

  if (!sourceId && sourceType !== ChatSourceTypeEnum.app) throw ChatErrEnum.unAuthChat;

  const resource = await (async () => {
    if (sourceType === ChatSourceTypeEnum.skillEdit) {
      const auth = await authSkill({ ...props, authAppApiKey: false, skillId: sourceId!, per });
      return { ...auth, app: undefined };
    }

    const auth = await authApp({
      // 普通 App 保持旧入口同时支持 Token/API Key；辅助生成继续使用调用方指定的认证方式。
      ...(sourceType === ChatSourceTypeEnum.app
        ? {
            req: props.req,
            authToken: true,
            authApiKey: true,
            authAppApiKey: props.authAppApiKey ?? true
          }
        : { ...props, authAppApiKey: false }),
      appId: sourceId,
      per: sourceType === ChatSourceTypeEnum.workflowBuilder ? WritePermissionVal : per
    });
    if (sourceType === ChatSourceTypeEnum.chatAgentHelper && !auth.userId) {
      throw ChatErrEnum.unAuthChat;
    }
    return { ...auth, skill: undefined };
  })();

  if (!sourceId && resource.apiKeyType !== ApiKeyTypeEnum.app) throw ChatErrEnum.unAuthChat;
  if (resource.apiKeyType === ApiKeyTypeEnum.app && sourceType !== ChatSourceTypeEnum.app)
    throw ChatErrEnum.unAuthChat;

  const memberOnly =
    sourceType === ChatSourceTypeEnum.workflowBuilder ||
    (sourceType !== ChatSourceTypeEnum.skillEdit &&
      resource.apiKeyType !== ApiKeyTypeEnum.app &&
      !('hasReadChatLogPer' in resource.permission && resource.permission.hasReadChatLogPer));
  const scope: ChatAccessScope = {
    teamId: resource.teamId,
    ...(memberOnly ? { tmbId: resource.tmbId } : {})
  };
  const resolvedSourceId = resource.app ? String(resource.app._id) : sourceId!;
  const chat = await loadChat(resolvedSourceId);
  if (chat) assertChatAccess({ chat, scope });

  const uid = (() => {
    if (sourceType === ChatSourceTypeEnum.app && chat) return chat.outLinkUid ?? chat.tmbId;
    if (sourceType === ChatSourceTypeEnum.chatAgentHelper && chat?.tmbId) return String(chat.tmbId);
    return resource.tmbId;
  })();

  return {
    sourceType,
    sourceId: resolvedSourceId,
    userId: resource.userId,
    teamId: resource.teamId,
    tmbId: resource.tmbId,
    uid,
    chat,
    scope,
    app: resource.app,
    skill: resource.skill,
    isRoot: resource.isRoot,
    authType: resource.authType,
    apiKeyType: resource.apiKeyType,
    ...chatSourceResponseOptions[sourceType]
  };
};

/**
 * 引用接口同时支持直接访问知识库与对话上下文；仅可信应用 Key 可补出缺失的 App target。
 * 已提供的 Skill/外链/辅助来源保持原优先级；个人密钥和登录态不被改成应用会话。
 * 这里只解析身份，实际资源及会话权限仍由 authChatTargetCrud 重新确认。
 */
export const resolveOptionalAppApiKeyChatTarget = async ({
  req,
  sourceType,
  sourceId
}: {
  req: AuthModeType['req'];
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
}) => {
  if (sourceType || sourceId || !req.headers?.authorization) return { sourceType, sourceId };
  const certificate = await parseHeaderCert({
    req,
    authToken: true,
    authApiKey: true,
    authAppApiKey: true
  });
  return certificate.apiKeyType === ApiKeyTypeEnum.app
    ? { sourceType: ChatSourceTypeEnum.app, sourceId: certificate.boundAppId }
    : { sourceType, sourceId };
};
