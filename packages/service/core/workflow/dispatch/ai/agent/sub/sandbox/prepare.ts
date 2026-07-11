import type { AgentInputFile } from '../../adapter/userContext';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import {
  type DeployedSkillInfo,
  type DeployedSkillVersion,
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox,
  injectCurrentInputFiles,
  prepareAgentSandboxRuntime,
  preparePackageMirrors,
  prepareSandbox,
  readCurrentWorkingDirectory,
  runAgentSkillVersionEntrypoints,
  runSandboxEntrypoint,
  withAgentSandboxInitLease,
  type SandboxClient,
  type SandboxPrepareContext,
  type SandboxPrepareStep
} from '../../../../../../ai/sandbox/interface/runtime';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

export type AgentSandboxPrepareContext = SandboxPrepareContext & {
  sandboxClient: SandboxClient;
  deployedSkillVersions: DeployedSkillVersion[];
  skillInfos: DeployedSkillInfo[];
  skillScanDirectories: string[];
};

export type AgentSandboxPrepareAction = (
  context: AgentSandboxPrepareContext
) => Promise<AgentSandboxPrepareContext>;

type EnsureAgentSandboxRuntimeParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  teamId: string;
  tmbId: string;
  needSandboxRuntime: boolean;
  sandboxEntrypoint?: string;
  skillIds: string[];
  selectedSkills?: SelectedAgentSkillItemType[];
  editSkillId?: string;
  prepareActions?: AgentSandboxPrepareAction[];
  currentFiles: AgentInputFile[];
};
type EnsureAgentSandboxRuntimeResult = {
  sandboxClient?: SandboxClient;
  currentWorkingDirectory?: string;
  skillInfos: DeployedSkillInfo[];
};
type AgentSandboxPrepareStep = SandboxPrepareStep<AgentSandboxPrepareContext>;

/**
 * 确保 Agent 本轮 sandbox runtime 可用。
 *
 * workflow 层显式编排本轮 sandbox 生命周期；runtime 层只暴露具体原子能力。
 */
export async function ensureAgentSandboxRuntime({
  sourceType,
  sourceId,
  userId,
  chatId,
  teamId,
  tmbId,
  needSandboxRuntime,
  sandboxEntrypoint,
  skillIds,
  selectedSkills,
  editSkillId,
  prepareActions = [],
  currentFiles
}: EnsureAgentSandboxRuntimeParams): Promise<EnsureAgentSandboxRuntimeResult> {
  if (!needSandboxRuntime) {
    return {
      skillInfos: []
    };
  }

  const sandboxContext = await prepareAgentSandboxRuntime({
    sourceType,
    sourceId,
    userId,
    chatId,
    teamId
  });

  const preparedContext = await withAgentSandboxInitLease({
    sandboxId: sandboxContext.sandboxClient.getSandboxId(),
    fn: () => {
      const context = {
        ...sandboxContext,
        sandbox: sandboxContext.sandboxClient.provider,
        deployedSkillVersions: [],
        skillInfos: [],
        skillScanDirectories: []
      };

      return editSkillId
        ? prepareSandbox(
            context,
            preparePackageMirrors(),
            injectCurrentInputFiles(currentFiles),
            ...prepareActions,
            readCurrentWorkingDirectory(),
            scanEditDebugSkillInfos()
          )
        : prepareSandbox(
            context,
            preparePackageMirrors(),
            injectSelectedSkillFiles({ teamId, tmbId, skillIds, selectedSkills }),
            injectCurrentInputFiles(currentFiles),
            ...prepareActions,
            readCurrentWorkingDirectory(),
            runSandboxEntrypoint({ sandboxEntrypoint }),
            runSelectedSkillEntrypoints(),
            scanSelectedSkillInfos()
          );
    }
  });

  return {
    sandboxClient: sandboxContext.sandboxClient,
    currentWorkingDirectory: preparedContext.currentWorkingDirectory,
    skillInfos: preparedContext.skillInfos
  };
}

const scanEditDebugSkillInfos = (): AgentSandboxPrepareStep => async (context) => ({
  ...context,
  skillInfos: await getAgentSkillInfos({
    sandbox: context.sandbox,
    skillDirectories: [context.workDirectory, ...context.skillScanDirectories]
  })
});

const injectSelectedSkillFiles =
  ({
    teamId,
    tmbId,
    skillIds,
    selectedSkills
  }: {
    teamId: string;
    tmbId: string;
    skillIds: string[];
    selectedSkills?: SelectedAgentSkillItemType[];
  }): AgentSandboxPrepareStep =>
  async (context) => {
    const deployedSkillVersions = await injectAgentSkillFilesToSandbox({
      sandbox: context.sandbox,
      teamId,
      tmbId,
      skillIds,
      workDirectory: context.workDirectory
    });
    const selectedSkillMap = new Map(selectedSkills?.map((skill) => [skill.skillId, skill]) || []);

    return {
      ...context,
      deployedSkillVersions: deployedSkillVersions.map((version) => {
        const selectedSkill = version.skillId ? selectedSkillMap.get(version.skillId) : undefined;

        return {
          ...version,
          ...(selectedSkill
            ? {
                name: selectedSkill.name,
                description: selectedSkill.description,
                avatar: selectedSkill.avatar
              }
            : {})
        };
      })
    };
  };

const runSelectedSkillEntrypoints = (): AgentSandboxPrepareStep => async (context) => {
  if (context.deployedSkillVersions.length > 0) {
    await runAgentSkillVersionEntrypoints({
      sandbox: context.sandbox,
      versions: context.deployedSkillVersions
    });
  }
  return context;
};

const scanSelectedSkillInfos = (): AgentSandboxPrepareStep => async (context) => ({
  ...context,
  skillInfos: await (() => {
    const skillDirectories = [
      ...context.deployedSkillVersions.map(({ targetDir }) => targetDir),
      ...context.skillScanDirectories
    ];
    return skillDirectories.length > 0
      ? getAgentSkillInfos({
          sandbox: context.sandbox,
          skillDirectories,
          deployedSkillVersions: context.deployedSkillVersions
        })
      : Promise.resolve([]);
  })()
});
