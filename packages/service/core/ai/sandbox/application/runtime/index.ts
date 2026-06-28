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
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId } from '../../utils/id';
import type { SandboxProviderType } from '../../type';

export type { SandboxRuntimeProfile, SandboxRuntimeScenario };

export type AgentSandboxRuntimeContext = {
  sandboxClient: SandboxClient;
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

  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });
  const sandboxClient = await getSandboxClient(
    {
      sandboxId,
      sourceType,
      sourceId,
      userId: sourceType === ChatSourceTypeEnum.app ? userId : '',
      chatId
    },
    {
      failedArchivePolicy: 'clearAndContinue'
    }
  );
  const runtimeProfile = getSandboxRuntimeProfile();

  return {
    sandboxClient,
    workDirectory: runtimeProfile.workDirectory
  };
}
