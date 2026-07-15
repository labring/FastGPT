import {
  getAgentSkillInfos,
  prepareAgentSandboxRuntime,
  preparePackageMirrors,
  prepareSandbox,
  readCurrentWorkingDirectory,
  withAgentSandboxInitLease,
  type AgentSandboxPrepareAction,
  type AgentSandboxPrepareContext,
  type DeployedSkillInfo,
  type SandboxClient
} from '../../sandbox/interface/runtime';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../skill/edit/config';

export type SkillEditRuntime = {
  sandboxClient: SandboxClient;
  currentWorkingDirectory?: string;
  skillInfos: DeployedSkillInfo[];
};

type SkillEditSandboxPrepareContext = AgentSandboxPrepareContext & {
  skillInfos?: DeployedSkillInfo[];
};

/**
 * 准备 Skill 编辑调试使用的 sandbox runtime。
 *
 * 公共层只执行调用方传入的 prepare actions；内置 Skill 的来源和注入策略由 Pro/API 层决定。
 */
export const prepareSkillEditRuntime = async ({
  skillId,
  userId,
  teamId,
  prepareActions = []
}: {
  skillId: string;
  userId: string;
  teamId: string;
  prepareActions?: AgentSandboxPrepareAction[];
}): Promise<SkillEditRuntime> => {
  const sandboxContext = await prepareAgentSandboxRuntime({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    userId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    teamId
  });

  const preparedContext = await withAgentSandboxInitLease({
    sandboxId: sandboxContext.sandboxClient.getSandboxId(),
    fn: () =>
      prepareSandbox<SkillEditSandboxPrepareContext>(
        {
          ...sandboxContext,
          sandbox: sandboxContext.sandboxClient.provider,
          skillScanDirectories: [],
          skillInfos: []
        },
        preparePackageMirrors(),
        ...prepareActions,
        readCurrentWorkingDirectory(),
        async (context) => ({
          ...context,
          skillInfos: await getAgentSkillInfos({
            sandbox: context.sandbox,
            skillDirectories: [context.workDirectory, ...context.skillScanDirectories]
          })
        })
      )
  });

  return {
    sandboxClient: preparedContext.sandboxClient,
    currentWorkingDirectory: preparedContext.currentWorkingDirectory,
    skillInfos: preparedContext.skillInfos ?? []
  };
};
