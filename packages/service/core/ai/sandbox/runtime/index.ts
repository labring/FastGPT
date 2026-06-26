import { getSandboxClient, type SandboxClient } from '../service/runtime';
import { createAgentSandboxPermissionDeniedError } from '../error';
import { checkTeamSandboxPermission } from '../../../../support/permission/teamLimit';
import { getSandboxRuntimeProfile } from './profile';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId } from './id';

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

  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });
  const sandboxClient = await getSandboxClient({
    sandboxId,
    sourceType,
    sourceId,
    // sandbox 实例表暂时仍复用物理 appId 字段；业务层统一传 sourceType/sourceId。
    appId: sourceId,
    userId: sourceType === ChatSourceTypeEnum.app ? userId : '',
    chatId
  });
  const runtimeProfile = getSandboxRuntimeProfile();

  return {
    sandboxClient,
    workDirectory: runtimeProfile.workDirectory
  };
}
