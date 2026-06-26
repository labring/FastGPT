import { getSandboxClient, type SandboxClient } from '../service/runtime';
import { createAgentSandboxPermissionDeniedError } from '../error';
import { checkTeamSandboxPermission } from '../../../../support/permission/teamLimit';
import { getSandboxRuntimeProfile } from './profile';

export type AgentSandboxRuntimeContext = {
  sandboxClient: SandboxClient;
  workDirectory: string;
};

/**
 * 准备 Agent 运行需要的 sandbox runtime。
 *
 * 该函数只负责 sandbox 维度：权限校验、实例获取和 runtime profile 解析。
 * skill 注入、entrypoint 和扫描由 skill runtime 自己处理。
 */
export async function prepareAgentSandboxRuntime({
  appId,
  userId,
  chatId,
  sandboxId,
  teamId
}: {
  appId: string;
  userId: string;
  chatId: string;
  sandboxId?: string;
  teamId: string;
}): Promise<AgentSandboxRuntimeContext> {
  try {
    await checkTeamSandboxPermission(teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }

  const sandboxClient = await getSandboxClient(
    sandboxId ? { sandboxId } : { appId, userId, chatId }
  );
  const runtimeProfile = getSandboxRuntimeProfile();

  return {
    sandboxClient,
    workDirectory: runtimeProfile.workDirectory
  };
}
