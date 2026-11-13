/**
 * 沙盒业务层：提供 Agent 运行态 sandbox 寻址与准备入口。
 *
 * 负责标准 source 寻址参数构造和运行态 client 创建，不注入具体 Skill 包。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isAppSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../../skill/edit/config';
import { getSandboxUserId } from '../../utils/id';
import type { SandboxClientQuery } from './type';
import { getSandboxClient, type SandboxClient } from './client';

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
  const sandboxId = generateSandboxId({
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
    // Skill 调试对话会携带各自会话的 chatId 记录聊天历史，但运行时统一复用共享的 edit-debug 物理沙盒；
    // HTTP 沙盒接口对外部传入 chatId 的约束仍保留在 authSandboxSession 鉴权层。
    return {
      sandboxId,
      sourceType,
      sourceId,
      userId: sandboxUserId,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
    };
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox runtime');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}

type AgentSandboxRuntimeContext = {
  sandboxClient: SandboxClient;
  /** Sandbox 共享根目录，用于 App entrypoint 和共享 Skill。 */
  workspaceRoot: string;
  /** 当前 prepare step 的默认目录；App 为 session，Skill Edit 为 workspaceRoot。 */
  workDirectory: string;
};

/**
 * 准备 Agent 运行需要的 sandbox runtime。
 *
 * 该函数只负责 sandbox 维度：实例获取和运行态路径解析。
 * 权限与产品可用性必须由上层在进入 runtime 前完成，避免底层通过布尔参数绕过校验。
 */
export async function prepareAgentSandboxRuntime({
  sourceType,
  sourceId,
  userId,
  chatId,
  onUpgrade
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  onUpgrade?: () => void;
}): Promise<AgentSandboxRuntimeContext> {
  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType,
    sourceId,
    userId,
    chatId
  });
  const sandboxClient = onUpgrade
    ? await getSandboxClient(sandboxQuery, { onUpgrade })
    : await getSandboxClient(sandboxQuery);
  const runtimePaths = sandboxClient.getRuntimePaths();

  return {
    sandboxClient,
    workspaceRoot: runtimePaths.workspaceRoot,
    workDirectory: runtimePaths.sessionWorkDirectory
  };
}
