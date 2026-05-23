import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { AgentInputFile } from '../../adapter/userContext';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox,
  type DeployedSkillInfo
} from '../../../../../../ai/skill/runtime';
import { getSandboxRuntimeProfile } from '../../../../../../ai/sandbox/runtime/profile';
import { getSandboxClient, type SandboxClient } from '../../../../../../ai/sandbox/service/runtime';
import { pickOutboundAxios } from '../../../../../../../common/api/axios';
import { checkTeamSandboxPermission } from '../../../../../../../support/permission/teamLimit';

type UseSandboxParams = {
  appId: string;
  userId: string;
  chatId: string;
  teamId: string;
  useAgentSandbox: boolean;
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
  teamId,
  useAgentSandbox,
  skillIds,
  editSkillId,
  currentFiles
}: UseSandboxParams): Promise<UseSandboxResult> {
  const hasEditSkill = !!editSkillId;
  const hasAgentSkills = skillIds.length > 0;
  const needSandbox = useAgentSandbox || hasEditSkill || hasAgentSkills;

  if (needSandbox) {
    try {
      await checkTeamSandboxPermission(teamId);
    } catch {
      throw new Error('当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。');
    }
  }

  if (!needSandbox) {
    return {
      skillInfos: []
    };
  }

  // 确认使用沙盒，启动沙盒实例
  const sandboxClient = await getSandboxClient({ appId, userId, chatId });

  const getSkillsInfo = async () => {
    // 编辑模式下复用编辑器已经写入 skills 目录的 skill 文件，避免工作区其他 SKILL.md 进入 prompt。
    if (hasEditSkill) {
      const runtimeProfile = getSandboxRuntimeProfile();
      return getAgentSkillInfos({
        sandbox: sandboxClient.provider,
        workDirectory: runtimeProfile.skillsRootPath
      });
    } else if (hasAgentSkills) {
      return injectAgentSkillFilesToSandbox({
        sandbox: sandboxClient.provider,
        skillIds,
        teamId,
        workDirectory: '.'
      });
    }
    return [];
  };

  const [, skillInfos, currentWorkingDirectory] = await Promise.all([
    injectInputFilesToSandbox(sandboxClient.provider, currentFiles),
    getSkillsInfo(),
    readSandboxPwd(sandboxClient)
  ]);

  return {
    sandboxClient,
    currentWorkingDirectory,
    skillInfos
  };
}
