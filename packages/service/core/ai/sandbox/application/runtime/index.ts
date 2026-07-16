/**
 * 沙盒业务层：准备 Agent 运行态 sandbox。
 *
 * 负责权限校验、sandboxId 计算和运行态 client 创建，不注入具体 Skill 包。
 */
import { getSandboxClient, type SandboxClient } from './client';
import { createAgentSandboxPermissionDeniedError } from '../../error';
import { checkTeamSandboxPermission } from '../../../../../support/permission/teamLimit';
import { getSandboxRuntimeProfile as resolveSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import type {
  SandboxRuntimeProfile,
  SandboxRuntimeScenario
} from '../../infrastructure/provider/runtimeProfile';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId, getSandboxUserId } from '../../utils/id';
import type { SandboxProviderType } from '../../type';
import { getSandboxRuntimePaths } from '../../utils';

export type { SandboxRuntimeProfile, SandboxRuntimeScenario };

export type AgentSandboxRuntimeContext = {
  sandboxClient: SandboxClient;
  /** Sandbox 共享根目录，用于 App entrypoint 和共享 Skill。 */
  workspaceRoot: string;
  /** 当前 prepare step 的默认目录；App 为 session，Skill Edit 为 workspaceRoot。 */
  workDirectory: string;
};

/**
 * 读取指定 provider 的运行态 profile。
 *
 * 对外业务只通过 application/interface 读取工作目录和启动配置，provider 选择与默认值
 * 仍由 infrastructure/runtimeProfile 维护。
 */
export function getSandboxRuntimeProfile(provider?: SandboxProviderType): SandboxRuntimeProfile {
  return resolveSandboxRuntimeProfile(provider);
}

/**
 * 准备 Agent 运行需要的 sandbox runtime。
 *
 * 该函数只负责 sandbox 维度：权限校验、实例获取和 runtime profile 解析。
 * skill 注入、entrypoint 和扫描由 skill runtime 自己处理。
 */
export async function prepareAgentSandboxRuntime({
  sourceType,
  sourceId,
  userId,
  chatId,
  teamId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  teamId: string;
}): Promise<AgentSandboxRuntimeContext> {
  try {
    await checkTeamSandboxPermission(teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }

  const sandboxUserId = getSandboxUserId({ sourceType, userId });
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId: sandboxUserId
  });
  const sandboxClient = await getSandboxClient({
    sandboxId,
    sourceType,
    sourceId,
    userId: sandboxUserId,
    chatId
  });
  const runtimeProfile = getSandboxRuntimeProfile();
  const runtimePaths = getSandboxRuntimePaths({
    sourceType,
    workDirectory: runtimeProfile.workDirectory,
    chatId
  });

  return {
    sandboxClient,
    workspaceRoot: runtimePaths.workspaceRoot,
    workDirectory: runtimePaths.sessionWorkDirectory
  };
}
