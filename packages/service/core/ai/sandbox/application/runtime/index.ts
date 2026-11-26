/**
 * 沙盒业务层：准备 Agent 运行态 sandbox。
 *
 * 负责 sandboxId 计算和运行态 client 创建，不注入具体 Skill 包。
 */
import { getSandboxClient, type SandboxClient } from './client';
import { getSandboxStaticRuntimePaths } from '../../infrastructure/opensandbox/runtimeProfile';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId, getSandboxUserId } from '../../utils/id';
import { getSandboxRuntimePaths } from '../../utils';

export const SANDBOX_BUILTIN_SKILLS_ROOT_PATH =
  getSandboxStaticRuntimePaths().builtinSkillsRootPath;

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
 * 该函数只负责 sandbox 维度：实例获取和 runtime profile 解析。
 * 权限与产品可用性必须由上层在进入 runtime 前完成，避免底层通过布尔参数绕过校验。
 * skill 注入、entrypoint 和扫描由 skill runtime 自己处理。
 */
export async function prepareAgentSandboxRuntime({
  sourceType,
  sourceId,
  userId,
  chatId,
  onUpgrade,
  onUpgradeComplete
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  onUpgrade?: () => void;
  onUpgradeComplete?: () => void;
}): Promise<AgentSandboxRuntimeContext> {
  const sandboxUserId = getSandboxUserId({ sourceType, userId });
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId: sandboxUserId
  });
  const sandboxClient = await getSandboxClient(
    {
      sandboxId,
      sourceType,
      sourceId,
      userId: sandboxUserId,
      chatId
    },
    {
      ...(onUpgrade ? { onUpgrade } : {}),
      ...(onUpgradeComplete ? { onUpgradeComplete } : {})
    }
  );
  const { workDirectory } = getSandboxStaticRuntimePaths();
  const runtimePaths = getSandboxRuntimePaths({
    sourceType,
    workDirectory,
    chatId
  });

  return {
    sandboxClient,
    workspaceRoot: runtimePaths.workspaceRoot,
    workDirectory: runtimePaths.sessionWorkDirectory
  };
}
