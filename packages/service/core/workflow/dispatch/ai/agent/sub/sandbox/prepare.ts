import { loadWorkflowSkillResources } from '../../../../../resource/service';
import type { AgentInputFile } from '../../adapter/userContext';
import type { BuiltinSkillSource } from '@fastgpt/global/core/ai/skill/runtime/builtin';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import {
  type DeployedSkillInfo,
  type DeployedSkillVersion
} from '../../../../../../ai/sandbox/application/runtime/skill/types';
import {
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox
} from '../../../../../../ai/sandbox/application/runtime/skill/core';
import {
  getBuiltinSkillsRootPath,
  syncBuiltinSkillsToSandbox
} from '../../../../../../ai/sandbox/application/runtime/skill/builtin';
import {
  injectCurrentInputFiles,
  preparePackageMirrors,
  prepareSandbox,
  type SandboxPrepareContext,
  type SandboxPrepareStep
} from '../../../../../../ai/sandbox/application/runtime/prepare';
import { OPEN_SANDBOX_DEFAULT_HOME_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { prepareAgentSandboxRuntime } from '../../../../../../ai/sandbox/application/runtime';
import { runAgentSkillVersionEntrypoints } from '../../../../../../ai/sandbox/application/runtime/skill/entrypoint';
import {
  runSandboxEntrypoint,
  withAgentSandboxInitLease
} from '../../../../../../ai/sandbox/application/runtime/entrypoint';
import { type SandboxClient } from '../../../../../../ai/sandbox/application/runtime/client';
import {
  buildSandboxInputFileScopeKey,
  getSandboxInputFileNameAllocation
} from '../../../../../../ai/sandbox/utils';
import { getRunningSandboxId } from '../../../../../../ai/sandbox/utils/id';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { readWorkflowFileBuffer, WorkflowContext } from '../../../../../utils/context';

export type AgentSandboxPrepareContext = SandboxPrepareContext & {
  sandboxClient: SandboxClient;
  deployedSkillVersions: DeployedSkillVersion[];
  skillInfos: DeployedSkillInfo[];
  skillScanDirectories: string[];
};

export type AgentSandboxPrepareAction = SandboxPrepareStep<AgentSandboxPrepareContext>;

type EnsureAgentSandboxRuntimeParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  tmbId: string;
  needSandboxRuntime: boolean;
  sandboxEntrypoint?: string;
  sandboxEntrypointScope: string;
  skillIds: string[];
  selectedSkills?: SelectedAgentSkillItemType[];
  editSkillId?: string;
  prepareActions?: AgentSandboxPrepareAction[];
  currentFiles: AgentInputFile[];
  onUpgrade?: () => void;
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
  tmbId,
  needSandboxRuntime,
  sandboxEntrypoint,
  sandboxEntrypointScope,
  skillIds,
  selectedSkills,
  editSkillId,
  prepareActions = [],
  currentFiles,
  onUpgrade
}: EnsureAgentSandboxRuntimeParams): Promise<EnsureAgentSandboxRuntimeResult> {
  if (!needSandboxRuntime) {
    return {
      skillInfos: []
    };
  }

  const readInputFile = (url: string) => readWorkflowFileBuffer({ url });
  const workflowSandboxContext = WorkflowContext.getStore()?.sandboxContext;
  const scopeKey = buildSandboxInputFileScopeKey({
    sourceType,
    sourceId,
    userId,
    chatId
  });
  return withAgentSandboxInitLease({
    sandboxId: getRunningSandboxId({ sourceType, sourceId, userId }),
    fn: async () => {
      const sandboxContext = await prepareAgentSandboxRuntime({
        sourceType,
        sourceId,
        userId,
        chatId,
        onUpgrade
      });

      return sandboxContext.sandboxClient.retryOnRecoverableError(async () => {
        const attemptFiles = currentFiles.map((file) => ({ ...file }));
        const inputFileAllocation = getSandboxInputFileNameAllocation({
          scopeKey,
          contextOwner: workflowSandboxContext,
          sandbox: sandboxContext.sandboxClient.opensandbox,
          workDirectory: sandboxContext.workDirectory
        });
        const context = {
          ...sandboxContext,
          sandbox: sandboxContext.sandboxClient.opensandbox,
          inputFileAllocation,
          deployedSkillVersions: [],
          skillInfos: [],
          skillScanDirectories: []
        };

        const preparedContext = await (editSkillId
          ? prepareSandbox(
              context,
              preparePackageMirrors(),
              injectCurrentInputFiles(attemptFiles, readInputFile),
              ...prepareActions,
              scanEditDebugSkillInfos()
            )
          : prepareSandbox(
              context,
              preparePackageMirrors(),
              injectSelectedSkillFiles({
                tmbId,
                skillIds,
                selectedSkills
              }),
              injectCurrentInputFiles(attemptFiles, readInputFile),
              ...prepareActions,
              runSandboxEntrypoint({ sandboxEntrypoint, scope: sandboxEntrypointScope }),
              runSelectedSkillEntrypoints(),
              scanSelectedSkillInfos()
            ));

        attemptFiles.forEach((file, index) => {
          Object.assign(currentFiles[index], file);
        });

        return {
          sandboxClient: sandboxContext.sandboxClient,
          currentWorkingDirectory: sandboxContext.workDirectory,
          skillInfos: preparedContext.skillInfos
        };
      });
    }
  });
}

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

    const homeDirectory = OPEN_SANDBOX_DEFAULT_HOME_PATH;

    await injectToSandbox({
      sandbox: context.sandbox,
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
    sandbox: context.sandbox,
    skillDirectories: [context.workDirectory, ...context.skillScanDirectories]
  })
});

const injectSelectedSkillFiles =
  ({
    tmbId,
    skillIds,
    selectedSkills
  }: {
    tmbId: string;
    skillIds: string[];
    selectedSkills?: SelectedAgentSkillItemType[];
  }): AgentSandboxPrepareStep =>
  async (context) => {
    const skills = await loadWorkflowSkillResources({ skillIds, tmbId });
    const deployedSkillVersions = await injectAgentSkillFilesToSandbox({
      sandbox: context.sandbox,
      skills,
      workDirectory: context.workspaceRoot ?? context.workDirectory
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
      versions: context.deployedSkillVersions,
      workspaceDirectory: context.workspaceRoot ?? context.workDirectory
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
