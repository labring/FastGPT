import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { AgentInputFile } from '../../adapter/userContext';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox,
  type DeployedSkillInfo
} from '../../../../../../ai/skill/runtime';
import {
  runAgentSandboxEntrypoint,
  runAgentSkillVersionEntrypoints,
  withAgentSandboxInitLease
} from '../../../../../../ai/skill/runtime/entrypoint';
import { getBuiltinSkillsRootPath } from '../../../../../../ai/skill/runtime/builtin';
import { getSandboxRuntimeProfile } from '../../../../../../ai/sandbox/runtime/profile';
import { getSandboxClient, type SandboxClient } from '../../../../../../ai/sandbox/service/runtime';
import { pickOutboundAxios } from '../../../../../../../common/api/axios';
import { checkTeamSandboxPermission } from '../../../../../../../support/permission/teamLimit';
import { createAgentSandboxPermissionDeniedError } from '../../../../../../ai/sandbox/error';
import { getSafeAgentInputFilename } from '../../adapter/fileName';

export type AgentSandboxBootstrap = (context: {
  sandboxClient: SandboxClient;
  sandbox: ISandbox;
  workDirectory: string;
}) => Promise<void>;

type EnsureAgentSandboxRuntimeParams = {
  appId: string;
  userId: string;
  chatId: string;
  sandboxId?: string;
  teamId: string;
  tmbId: string;
  needSandboxRuntime: boolean;
  sandboxBootstrap?: AgentSandboxBootstrap;
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

type SandboxRuntimeContext = {
  sandboxClient: SandboxClient;
  workDirectory: string;
  homeDirectory: string;
};

type InitRuntimeSandboxParams = SandboxRuntimeContext & {
  teamId: string;
  tmbId: string;
  skillIds: string[];
  sandboxBootstrap?: AgentSandboxBootstrap;
  sandboxEntrypoint?: string;
  currentFiles: AgentInputFile[];
};

type InitEditSkillSandboxParams = SandboxRuntimeContext & {
  currentFiles: AgentInputFile[];
};

/**
 * 读取 sandbox 当前目录，仅作为 user reminder 的提示增强。
 * 如果命令失败或没有输出，返回 undefined，让提示词侧完全跳过 pwd 区块。
 */
const readSandboxPwd = async (sandboxClient: SandboxClient) => {
  try {
    const result = await sandboxClient.exec('pwd');
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    return;
  }
};

/**
 * 将本轮用户输入文件写入当前 sandbox。
 *
 * 路径规则和通用 toolcall 保持一致：用户文件直接写入 user_files/<文件名>。
 * 这里直接消费 currentFiles，避免先构造中间 sandbox file 结构再二次遍历。
 */
const injectInputFilesToSandbox = async (sandbox: ISandbox, files: AgentInputFile[]) => {
  const writeFileTasks: Promise<FileWriteEntry>[] = [];
  const usedNames = new Map<string, number>();

  for (const [index, file] of files.entries()) {
    const filename = getSafeAgentInputFilename(file.name, index, usedNames);
    const path = `${SANDBOX_USER_FILES_PATH}${filename}`;
    writeFileTasks.push(
      pickOutboundAxios(file.url)
        .get<ArrayBuffer>(file.url, {
          responseType: 'arraybuffer'
        })
        .then((response) => ({
          path,
          data: response.data
        }))
    );
  }

  if (writeFileTasks.length === 0) return;
  await sandbox.writeFiles(await Promise.all(writeFileTasks));
};

/**
 * 初始化 edit-debug sandbox。
 *
 * 编辑调试包已解压到当前工作目录，这里只补齐用户输入文件和 SKILL.md 扫描。
 */
const initEditSkillSandbox = async ({
  sandboxClient,
  workDirectory,
  homeDirectory,
  currentFiles
}: InitEditSkillSandboxParams): Promise<Omit<EnsureAgentSandboxRuntimeResult, 'sandboxClient'>> => {
  const builtinSkillsRootPath = getBuiltinSkillsRootPath(homeDirectory);
  const [, currentWorkingDirectory, skillInfos] = await Promise.all([
    injectInputFilesToSandbox(sandboxClient.provider, currentFiles),
    readSandboxPwd(sandboxClient),
    getAgentSkillInfos({
      sandbox: sandboxClient.provider,
      skillDirectories: [workDirectory, builtinSkillsRootPath]
    })
  ]);

  return {
    currentWorkingDirectory,
    skillInfos
  };
};

/**
 * 初始化普通 Agent sandbox。
 *
 * 顺序固定为：平台 bootstrap 回调 -> 准备文件和 skill 包 -> sandbox entrypoint -> skill entrypoint -> 扫描 SKILL.md。
 */
const initRuntimeSandbox = async ({
  sandboxClient,
  workDirectory,
  teamId,
  tmbId,
  skillIds,
  sandboxBootstrap,
  sandboxEntrypoint,
  currentFiles
}: InitRuntimeSandboxParams): Promise<Omit<EnsureAgentSandboxRuntimeResult, 'sandboxClient'>> => {
  return withAgentSandboxInitLease({
    sandboxId: sandboxClient.getSandboxId(),
    fn: async () => {
      const sandbox = sandboxClient.provider;

      await sandboxBootstrap?.({
        sandboxClient,
        sandbox,
        workDirectory
      });

      const [deployedSkillVersions, , currentWorkingDirectory] = await Promise.all([
        injectAgentSkillFilesToSandbox({
          sandbox,
          skillIds,
          teamId,
          tmbId,
          workDirectory
        }),
        injectInputFilesToSandbox(sandbox, currentFiles),
        readSandboxPwd(sandboxClient)
      ]);

      const effectiveSandboxEntrypoint = sandboxEntrypoint?.trim();
      if (effectiveSandboxEntrypoint) {
        await runAgentSandboxEntrypoint({
          sandbox,
          sandboxEntrypoint: effectiveSandboxEntrypoint,
          workDirectory
        });
      }

      if (deployedSkillVersions.length > 0) {
        await runAgentSkillVersionEntrypoints({
          sandbox,
          versions: deployedSkillVersions
        });
      }

      const skillInfos =
        deployedSkillVersions.length > 0
          ? await getAgentSkillInfos({
              sandbox,
              skillDirectories: deployedSkillVersions.map(({ targetDir }) => targetDir)
            })
          : [];

      return {
        currentWorkingDirectory,
        skillInfos
      };
    }
  });
};

/**
 * 确保 Agent 本轮 sandbox runtime 可用。
 *
 * 只要显式启用 sandbox 或本轮有 skill，就在 agent-loop 前启动同一个
 * appId/userId/chatId sandbox，并完成本轮文件注入、skill 包注入和 SKILL.md 扫描。
 * 返回的 sandboxClient 会继续传给 sandbox tool，避免工具执行阶段重新定位实例。
 */
export async function ensureAgentSandboxRuntime({
  appId,
  userId,
  chatId,
  sandboxId,
  teamId,
  tmbId,
  needSandboxRuntime,
  sandboxBootstrap,
  sandboxEntrypoint,
  skillIds,
  editSkillId,
  currentFiles
}: EnsureAgentSandboxRuntimeParams): Promise<EnsureAgentSandboxRuntimeResult> {
  const hasEditSkill = !!editSkillId;
  if (needSandboxRuntime) {
    try {
      await checkTeamSandboxPermission(teamId);
    } catch {
      throw createAgentSandboxPermissionDeniedError();
    }
  }

  if (!needSandboxRuntime) {
    return {
      skillInfos: []
    };
  }

  // 确认使用沙盒，启动沙盒实例
  const sandboxClient = await getSandboxClient(
    sandboxId ? { sandboxId } : { appId, userId, chatId }
  );
  const runtimeProfile = getSandboxRuntimeProfile();
  const context = {
    sandboxClient,
    workDirectory: runtimeProfile.workDirectory,
    homeDirectory: runtimeProfile.homeDirectory
  };

  if (hasEditSkill) {
    const { currentWorkingDirectory, skillInfos } = await initEditSkillSandbox({
      ...context,
      currentFiles
    });

    return {
      sandboxClient,
      currentWorkingDirectory,
      skillInfos
    };
  }

  const { currentWorkingDirectory, skillInfos } = await initRuntimeSandbox({
    ...context,
    teamId,
    tmbId,
    skillIds,
    sandboxBootstrap,
    sandboxEntrypoint,
    currentFiles
  });

  return {
    sandboxClient,
    currentWorkingDirectory,
    skillInfos
  };
}
