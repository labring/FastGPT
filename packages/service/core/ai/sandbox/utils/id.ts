/**
 * 沙盒共用工具：根据标准 chat source 计算运行态 sandboxId。
 *
 * 只处理 app 和 skillEdit 的 id 规则，不查询数据库或 provider。
 */
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

/** 将调用用户收敛为 v2 Sandbox 逻辑身份使用的 userId。 */
export const getSandboxUserId = ({
  sourceType,
  userId
}: {
  sourceType: ChatSourceTypeEnum;
  userId: string;
}) => {
  if (sourceType === ChatSourceTypeEnum.app) {
    return userId;
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return ChatSourceTypeEnum.skillEdit;
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox identity');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};

/** 根据标准 chat source 语义计算本轮 Agent sandboxId。 */
export const getRunningSandboxId = ({
  sourceType,
  sourceId,
  userId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) => {
  return generateSandboxId({
    sourceType,
    sourceId,
    userId: getSandboxUserId({ sourceType, userId })
  });
};
