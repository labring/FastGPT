/**
 * 沙盒接口层：提供通用运行态 sandbox 入口。
 *
 * 本文件只暴露业务可调用的 runtime client 与 Agent runtime 准备能力；具体恢复、
 * 创建和 provider 控制流程仍由沙盒内部业务层承接。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isAppSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../skill/edit/config';
import { getRunningSandboxId, getSandboxUserId } from '../utils/id';
import type { SandboxClientQuery } from '../application/runtime/type';

type SandboxClientQueryWithId = SandboxClientQuery & { sandboxId: string; chatId: string };

/**
 * 将标准 chat source 映射为 sandbox runtime client 的物理寻址参数。
 *
 * sandbox runtime 只接收标准 source；App/Skill 的权限语义留在鉴权层处理。
 */
export function buildSandboxClientQueryFromChatSource({
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}): SandboxClientQueryWithId {
  const sandboxUserId = getSandboxUserId({ sourceType, userId });
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId: sandboxUserId
  });

  if (isAppSandboxSourceType(sourceType)) {
    return {
      sandboxId,
      sourceType,
      sourceId,
      userId: sandboxUserId,
      chatId
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    if (chatId !== EDIT_DEBUG_SANDBOX_CHAT_ID) {
      throw new Error('Skill edit sandbox only supports edit-debug chat');
    }

    return {
      sandboxId,
      sourceType,
      sourceId,
      userId: sandboxUserId,
      chatId
    };
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox runtime');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}
