/**
 * 沙盒共用工具：根据标准 chat source 计算运行态 sandboxId。
 *
 * 只处理 app 和 skillEdit 的 id 规则，不查询数据库或 provider。
 */
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getEditDebugSandboxId } from '../../skill/edit/config';

/** 根据标准 chat source 语义计算本轮 Agent sandboxId。 */
export const getRunningSandboxId = ({
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}) => {
  if (sourceType === ChatSourceTypeEnum.app) {
    return generateSandboxId(sourceId, userId, chatId);
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return getEditDebugSandboxId(sourceId);
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox id generation');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};
