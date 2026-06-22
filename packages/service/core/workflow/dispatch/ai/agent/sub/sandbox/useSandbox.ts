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
import { getSandboxRuntimeProfile } from '../../../../../../ai/sandbox/runtime/profile';
import { getSandboxClient, type SandboxClient } from '../../../../../../ai/sandbox/service/runtime';
import { pickOutboundAxios } from '../../../../../../../common/api/axios';
import { checkTeamSandboxPermission } from '../../../../../../../support/permission/teamLimit';
import { createAgentSandboxPermissionDeniedError } from '../../../../../../ai/sandbox/error';

type UseSandboxParams = {
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
type UseSandboxResult = {
  sandboxClient?: SandboxClient;
  currentWorkingDirectory?: string;
  skillInfos: DeployedSkillInfo[];
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

  for (const file of files) {
    const path = `${SANDBOX_USER_FILES_PATH}${file.name}`;
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
 * 初始化 Agent 本轮 sandbox。
 *
 * 只要显式启用 sandbox 或本轮有 skill，就在 agent-loop 前启动同一个
 * appId/userId/chatId sandbox，并完成本轮文件注入、skill 包注入和 SKILL.md 扫描。
 * 返回的 sandboxClient 会继续传给 sandbox tool，避免工具执行阶段重新定位实例。
 */
export async function useSandbox({
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
}: UseSandboxParams): Promise<UseSandboxResult> {
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

  if (hasEditSkill) {
    const [, currentWorkingDirectory, skillInfos] = await Promise.all([
      injectInputFilesToSandbox(sandboxClient.provider, currentFiles),
      readSandboxPwd(sandboxClient),
      // 编辑调试包已解压到当前工作目录，调度侧需要扫描同一目录才能读取 SKILL.md。
      getAgentSkillInfos({
        sandbox: sandboxClient.provider,
        workDirectory: runtimeProfile.workDirectory
      })
    ]);

    return {
      sandboxClient,
      currentWorkingDirectory,
      skillInfos
    };
  }

  const { currentWorkingDirectory, skillInfos } = await withAgentSandboxInitLease({
    sandboxId: sandboxClient.getSandboxId(),
    fn: async () => {
      const [deployedSkillVersions, , currentWorkingDirectory] = await Promise.all([
        injectAgentSkillFilesToSandbox({
          sandbox: sandboxClient.provider,
          skillIds,
          teamId,
          workDirectory: runtimeProfile.workDirectory
        }),
        injectInputFilesToSandbox(sandboxClient.provider, currentFiles),
        readSandboxPwd(sandboxClient)
      ]);
      const effectiveSandboxEntrypoint = sandboxEntrypoint?.trim();

      if (effectiveSandboxEntrypoint) {
        await runAgentSandboxEntrypoint({
          sandbox: sandboxClient.provider,
          sandboxEntrypoint: effectiveSandboxEntrypoint,
          workDirectory: runtimeProfile.workDirectory
        });
      }

      if (deployedSkillVersions.length > 0) {
        await runAgentSkillVersionEntrypoints({
          sandbox: sandboxClient.provider,
          versions: deployedSkillVersions
        });
      }

      const skillInfos =
        deployedSkillVersions.length > 0
          ? await getAgentSkillInfos({
              sandbox: sandboxClient.provider,
              skillDirectories: deployedSkillVersions.map(({ targetDir }) => targetDir)
            })
          : [];

      return {
        currentWorkingDirectory,
        skillInfos
      };
    }
  });

  return {
    sandboxClient,
    currentWorkingDirectory,
    skillInfos
  };
}
