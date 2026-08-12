import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  getAgentSkillInfos,
  prepareAgentSandboxRuntime,
  preparePackageMirrors,
  prepareSandbox,
  readCurrentWorkingDirectory,
  withAgentSandboxInitLease,
  type DeployedSkillInfo,
  type DeployedSkillVersion,
  type SandboxClient,
  type SandboxPrepareContext,
  type SandboxPrepareStep
} from '../../sandbox/interface/runtime';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../edit/config';

export type SkillDebugSandboxPrepareContext = SandboxPrepareContext & {
  sandboxClient: SandboxClient;
  deployedSkillVersions: DeployedSkillVersion[];
  skillInfos: DeployedSkillInfo[];
  skillScanDirectories: string[];
};

export type SkillDebugSandboxPrepareAction = SandboxPrepareStep<SkillDebugSandboxPrepareContext>;

export type SkillDebugRuntime = {
  sandboxClient: SandboxClient;
  currentWorkingDirectory?: string;
  skillInfos: DeployedSkillInfo[];
};

/**
 * 准备 Skill Debug 使用的 edit sandbox runtime。
 *
 * 公共层只执行调用方传入的 prepare actions；内置 Skill 的来源和注入策略由 Pro/API 层决定。
 */
export const prepareSkillDebugRuntime = async ({
  skillId,
  userId,
  prepareActions = []
}: {
  skillId: string;
  userId: string;
  prepareActions?: SkillDebugSandboxPrepareAction[];
}): Promise<SkillDebugRuntime> => {
  const sandboxContext = await prepareAgentSandboxRuntime({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    userId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
  });

  const scanSkillInfos = (): SkillDebugSandboxPrepareAction => async (context) => ({
    ...context,
    skillInfos: await getAgentSkillInfos({
      sandbox: context.sandbox,
      skillDirectories: [context.workDirectory, ...context.skillScanDirectories]
    })
  });
  const preparedContext = await withAgentSandboxInitLease({
    sandboxId: sandboxContext.sandboxClient.getSandboxId(),
    fn: () =>
      prepareSandbox<SkillDebugSandboxPrepareContext>(
        {
          ...sandboxContext,
          sandbox: sandboxContext.sandboxClient.provider,
          deployedSkillVersions: [],
          skillInfos: [],
          skillScanDirectories: []
        },
        preparePackageMirrors(),
        ...prepareActions,
        readCurrentWorkingDirectory(),
        scanSkillInfos()
      )
  });

  return {
    sandboxClient: preparedContext.sandboxClient,
    currentWorkingDirectory: preparedContext.currentWorkingDirectory,
    skillInfos: preparedContext.skillInfos
  };
};
