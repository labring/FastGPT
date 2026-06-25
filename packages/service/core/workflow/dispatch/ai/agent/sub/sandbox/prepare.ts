import type { AgentInputFile } from '../../adapter/userContext';
import type { DeployedSkillInfo, DeployedSkillVersion } from '../../../../../../ai/skill/runtime';
import type { BuiltinSkillSource } from '@fastgpt/global/core/ai/skill/runtime/builtin';
import {
  getAgentSkillInfos,
  getBuiltinSkillsRootPath,
  injectAgentSkillFilesToSandbox,
  syncBuiltinSkillsToSandbox,
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

export type AgentSandboxPrepareContext = {
  sandboxClient: SandboxClient;
  workDirectory: string;
  currentWorkingDirectory?: string;
  deployedSkillVersions: DeployedSkillVersion[];
  skillInfos: DeployedSkillInfo[];
  skillScanDirectories: string[];
};

export type AgentSandboxPrepareAction = (
  context: AgentSandboxPrepareContext
) => Promise<AgentSandboxPrepareContext>;

type EnsureAgentSandboxRuntimeParams = {
  appId: string;
  userId: string;
  chatId: string;
  sandboxId?: string;
  teamId: string;
  tmbId: string;
  needSandboxRuntime: boolean;
  sandboxEntrypoint?: string;
  skillIds: string[];
  editSkillId?: string;
  prepareActions?: AgentSandboxPrepareAction[];
  currentFiles: AgentInputFile[];
};
type EnsureAgentSandboxRuntimeResult = {
  sandboxClient?: SandboxClient;
  currentWorkingDirectory?: string;
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
  tmbId,
  needSandboxRuntime,
  sandboxEntrypoint,
  skillIds,
  editSkillId,
  prepareActions = [],
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
        deployedSkillVersions: [],
        skillInfos: [],
        skillScanDirectories: []
      };

      return editSkillId
        ? prepareSandbox(
            context,
            injectCurrentInputFiles(currentFiles),
            ...prepareActions,
            readCurrentWorkingDirectory(),
            scanEditDebugSkillInfos()
          )
        : prepareSandbox(
            context,
            injectSelectedSkillFiles({ teamId, tmbId, skillIds }),
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

const injectCurrentInputFiles =
  (currentFiles: AgentInputFile[]): AgentSandboxPrepareStep =>
  async (context) => {
    await injectInputFilesToSandbox(context.sandboxClient.provider, currentFiles);
    return context;
  };

const readCurrentWorkingDirectory = (): AgentSandboxPrepareStep => async (context) => ({
  ...context,
  currentWorkingDirectory: await readSandboxPwd(context.sandboxClient)
});

/**
 * 创建“同步内置 Skill 到当前 sandbox”的 prepare action。
 *
 * 调用方只提供内置 Skill 文件来源；具体同步位置、HOME 解析和后续扫描目录登记
 * 都在 sandbox prepare 生命周期内完成，避免 API 层感知 sandbox 细节。
 */
export const createBuiltinSkillPrepareAction =
  ({
    getSources,
    injectToSandbox = syncBuiltinSkillsToSandbox
  }: {
    getSources: () => Promise<BuiltinSkillSource[]>;
    injectToSandbox?: typeof syncBuiltinSkillsToSandbox;
  }): AgentSandboxPrepareAction =>
  async (context) => {
    const sources = await getSources();
    if (sources.length === 0) return context;

    const homeDirectory = await resolveSandboxHome(context.sandboxClient.provider);
    if (!homeDirectory) {
      throw new Error('Failed to resolve sandbox HOME for builtin skill sync');
    }

    await injectToSandbox({
      sandbox: context.sandboxClient.provider,
      homeDirectory,
      sources
    });

    const builtinSkillsRootPath = getBuiltinSkillsRootPath(homeDirectory);

    return {
      ...context,
      skillScanDirectories: [
        ...context.skillScanDirectories,
        ...sources.map((source) => `${builtinSkillsRootPath}/${source.name}`)
      ]
    };
  };

const scanEditDebugSkillInfos = (): AgentSandboxPrepareStep => async (context) => ({
  ...context,
  skillInfos: await getAgentSkillInfos({
    sandbox: context.sandboxClient.provider,
    skillDirectories: [context.workDirectory, ...context.skillScanDirectories]
  })
});

const injectSelectedSkillFiles =
  ({
    teamId,
    tmbId,
    skillIds
  }: {
    teamId: string;
    tmbId: string;
    skillIds: string[];
  }): AgentSandboxPrepareStep =>
  async (context) => ({
    ...context,
    deployedSkillVersions: await injectAgentSkillFilesToSandbox({
      sandbox: context.sandboxClient.provider,
      teamId,
      tmbId,
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
  skillInfos: await (() => {
    const skillDirectories = [
      ...context.deployedSkillVersions.map(({ targetDir }) => targetDir),
      ...context.skillScanDirectories
    ];
    return skillDirectories.length > 0
      ? getAgentSkillInfos({
          sandbox: context.sandboxClient.provider,
          skillDirectories
        })
      : Promise.resolve([]);
  })()
});
