import type { AgentInputFile } from '../../adapter/userContext';
import type { DeployedSkillInfo, DeployedSkillVersion } from '../../../../../../ai/skill/runtime';
import {
  getAgentSkillInfos,
  getBuiltinSkillsRootPath,
  injectAgentSkillFilesToSandbox,
  injectEditDebugBuiltinSkillsToSandbox,
  runAgentSkillVersionEntrypoints
} from '../../../../../../ai/skill/runtime';
import { prepareAgentSandboxRuntime } from '../../../../../../ai/sandbox/runtime';
import type { SandboxClient } from '../../../../../../ai/sandbox/service/runtime';
import {
  injectInputFilesToSandbox,
  readSandboxPwd
} from '../../../../../../ai/sandbox/runtime/files';
import {
  runAgentSandboxEntrypoint,
  withAgentSandboxInitLease
} from '../../../../../../ai/sandbox/runtime/entrypoint';
import { resolveSandboxHome } from '../../../../../../ai/sandbox/runtime/home';

type EnsureAgentSandboxRuntimeParams = {
  appId: string;
  userId: string;
  chatId: string;
  sandboxId?: string;
  teamId: string;
  needSandboxRuntime: boolean;
  sandboxEntrypoint?: string;
  skillIds: string[];
  editSkillId?: string;
  currentFiles: AgentInputFile[];
};
type EnsureAgentSandboxRuntimeResult = {
  sandboxClient?: SandboxClient;
  currentWorkingDirectory?: string;
  skillInfos: DeployedSkillInfo[];
};
type AgentSandboxPrepareContext = {
  sandboxClient: SandboxClient;
  workDirectory: string;
  currentFiles: AgentInputFile[];
  currentWorkingDirectory?: string;
  deployedSkillVersions: DeployedSkillVersion[];
  skillInfos: DeployedSkillInfo[];
};
type AgentSandboxPrepareStep = (
  context: AgentSandboxPrepareContext
) => Promise<AgentSandboxPrepareContext>;

/**
 * 确保 Agent 本轮 sandbox runtime 可用。
 *
 * workflow 层显式编排本轮 sandbox 生命周期；runtime 层只暴露具体原子能力。
 */
export async function ensureAgentSandboxRuntime({
  appId,
  userId,
  chatId,
  sandboxId,
  teamId,
  needSandboxRuntime,
  sandboxEntrypoint,
  skillIds,
  editSkillId,
  currentFiles
}: EnsureAgentSandboxRuntimeParams): Promise<EnsureAgentSandboxRuntimeResult> {
  const sandboxContext = await prepareAgentSandboxRuntime({
    appId,
    userId,
    chatId,
    sandboxId,
    teamId,
    needSandboxRuntime
  });
  if (!sandboxContext) {
    return {
      skillInfos: []
    };
  }

  const preparedContext = await withAgentSandboxInitLease({
    sandboxId: sandboxContext.sandboxClient.getSandboxId(),
    fn: () => {
      const context = {
        ...sandboxContext,
        currentFiles,
        deployedSkillVersions: [],
        skillInfos: []
      };

      return editSkillId
        ? prepareSandbox(
            context,
            injectCurrentInputFiles(),
            injectEditDebugBuiltinSkills(),
            readCurrentWorkingDirectory(),
            scanEditDebugSkillInfos()
          )
        : prepareSandbox(
            context,
            injectSelectedSkillFiles({ teamId, skillIds }),
            injectCurrentInputFiles(),
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

const prepareSandbox = async (
  context: AgentSandboxPrepareContext,
  ...steps: AgentSandboxPrepareStep[]
): Promise<AgentSandboxPrepareContext> => {
  let currentContext = context;
  for (const step of steps) {
    currentContext = await step(currentContext);
  }
  return currentContext;
};

const injectCurrentInputFiles = (): AgentSandboxPrepareStep => async (context) => {
  await injectInputFilesToSandbox(context.sandboxClient.provider, context.currentFiles);
  return context;
};

const readCurrentWorkingDirectory = (): AgentSandboxPrepareStep => async (context) => ({
  ...context,
  currentWorkingDirectory: await readSandboxPwd(context.sandboxClient)
});

const injectEditDebugBuiltinSkills = (): AgentSandboxPrepareStep => async (context) => {
  await injectEditDebugBuiltinSkillsToSandbox(context.sandboxClient.provider);
  return context;
};

const scanEditDebugSkillInfos = (): AgentSandboxPrepareStep => async (context) => {
  const homeDirectory = await resolveSandboxHome(context.sandboxClient.provider);
  const skillDirectories = homeDirectory
    ? [context.workDirectory, getBuiltinSkillsRootPath(homeDirectory)]
    : [context.workDirectory];

  return {
    ...context,
    skillInfos: await getAgentSkillInfos({
      sandbox: context.sandboxClient.provider,
      skillDirectories
    })
  };
};

const injectSelectedSkillFiles =
  ({ teamId, skillIds }: { teamId: string; skillIds: string[] }): AgentSandboxPrepareStep =>
  async (context) => ({
    ...context,
    deployedSkillVersions: await injectAgentSkillFilesToSandbox({
      sandbox: context.sandboxClient.provider,
      teamId,
      skillIds,
      workDirectory: context.workDirectory
    })
  });

const runSandboxEntrypoint =
  ({ sandboxEntrypoint }: { sandboxEntrypoint?: string }): AgentSandboxPrepareStep =>
  async (context) => {
    await runAgentSandboxEntrypoint({
      sandbox: context.sandboxClient.provider,
      sandboxEntrypoint,
      workDirectory: context.workDirectory
    });
    return context;
  };

const runSelectedSkillEntrypoints = (): AgentSandboxPrepareStep => async (context) => {
  if (context.deployedSkillVersions.length > 0) {
    await runAgentSkillVersionEntrypoints({
      sandbox: context.sandboxClient.provider,
      versions: context.deployedSkillVersions
    });
  }
  return context;
};

const scanSelectedSkillInfos = (): AgentSandboxPrepareStep => async (context) => ({
  ...context,
  skillInfos:
    context.deployedSkillVersions.length > 0
      ? await getAgentSkillInfos({
          sandbox: context.sandboxClient.provider,
          skillDirectories: context.deployedSkillVersions.map(({ targetDir }) => targetDir)
        })
      : []
});
