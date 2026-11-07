import { ChatSourceTypeEnum } from '../../core/chat/constants';

/**
 * 使用 App 生命周期、成员级身份和会话工作目录的沙箱来源。
 * Chat Agent Helper 不使用沙箱，因此不属于这一组；该分类不替代来源鉴权。
 */
export const isAppSandboxSourceType = (
  sourceType: unknown
): sourceType is ChatSourceTypeEnum.app | ChatSourceTypeEnum.workflowBuilder =>
  sourceType === ChatSourceTypeEnum.app || sourceType === ChatSourceTypeEnum.workflowBuilder;

/** 支持持久化沙箱资源的来源；Skill Edit 使用独立于 App 的归属和身份规则。 */
export const isSandboxSourceType = (
  sourceType: unknown
): sourceType is
  | ChatSourceTypeEnum.app
  | ChatSourceTypeEnum.workflowBuilder
  | ChatSourceTypeEnum.skillEdit =>
  isAppSandboxSourceType(sourceType) || sourceType === ChatSourceTypeEnum.skillEdit;

/** 使用独立会话类型的应用辅助生成来源，API target 必须显式携带 sourceType。 */
export const isAuxiliaryGenerationSourceType = (
  sourceType: unknown
): sourceType is ChatSourceTypeEnum.chatAgentHelper | ChatSourceTypeEnum.workflowBuilder =>
  sourceType === ChatSourceTypeEnum.chatAgentHelper ||
  sourceType === ChatSourceTypeEnum.workflowBuilder;

/** 必须精确匹配 sourceType 的聊天来源；只有普通 App 会话兼容缺少该字段的历史记录。 */
export const requiresExplicitChatSourceType = (
  sourceType: unknown
): sourceType is Exclude<ChatSourceTypeEnum, ChatSourceTypeEnum.app> =>
  isAuxiliaryGenerationSourceType(sourceType) || sourceType === ChatSourceTypeEnum.skillEdit;
