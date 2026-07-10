import type { DeployedSkillInfo } from '../../sandbox/interface/runtime';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { PendingMainContext, PlanAskPayload } from '../../llm/agentLoop';

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const SKILL_EDIT_AGENT_NODE_ID = 'skill-debug-agent';

type SkillEditAgentLoopMemory = {
  pendingMainContext?: PendingMainContext;
};

export const getSkillEditAgentLoopMemoryKey = () => `agentLoopMemory-${SKILL_EDIT_AGENT_NODE_ID}`;

/**
 * 从上一条 AI 消息恢复 skill edit agent loop 的 pending 状态。
 *
 * ask_agent 会暂停本轮 loop；下一轮用户回答时需要把保存的 messages 接回工具响应，
 * 否则模型会把回答当成普通新问题，丢失原追问上下文。
 */
export const readSkillEditAgentLoopMemory = ({
  histories
}: {
  histories: ChatItemMiniType[];
}): SkillEditAgentLoopMemory => {
  const lastHistory = histories[histories.length - 1];
  if (!lastHistory || lastHistory.obj !== ChatRoleEnum.AI) {
    return {};
  }

  return (
    (lastHistory.memories?.[getSkillEditAgentLoopMemoryKey()] as
      | SkillEditAgentLoopMemory
      | undefined) ?? {}
  );
};

/**
 * 构造 skill edit agent loop 写入 AI chat item 的 memory。
 */
export const buildSkillEditAgentLoopMemories = (memory: SkillEditAgentLoopMemory) => {
  const hasMemory = !!memory.pendingMainContext;

  return {
    [getSkillEditAgentLoopMemoryKey()]: hasMemory ? memory : undefined
  };
};

/** 将 ask_agent 的暂停结果转换成 ChatBox 可恢复的交互记录。 */
export const createSkillEditAskInteractive = ({
  planId,
  ask,
  usageId
}: {
  planId: string;
  ask: PlanAskPayload;
  usageId?: string;
}): WorkflowInteractiveResponseType => ({
  type: 'agentPlanAskQuery',
  planId,
  usageId,
  entryNodeIds: [],
  memoryEdges: [],
  nodeOutputs: [],
  params: {
    content: ask.question,
    reason: ask.reason,
    blockerType: ask.blockerType,
    options: ask.options
  }
});

export type SkillEditInputFileType = {
  id: string;
  name: string;
  type: ChatFileTypeEnum;
  url: string;
};

/** 构造当前 Human message 的 Skill、文件、sandbox 边界和时区 reminder。 */
export const buildSkillEditUserReminderInput = ({
  query,
  skillInfos = [],
  filesInfo = [],
  currentWorkingDirectory,
  currentTime
}: {
  query: string;
  skillInfos?: DeployedSkillInfo[];
  filesInfo?: SkillEditInputFileType[];
  currentWorkingDirectory?: string;
  currentTime?: string;
}) => {
  const buildSkillsPrompt = () => {
    if (skillInfos.length === 0) return '';

    return `## 技能
你可以使用可复用的技能。每个技能都提供针对特定任务的操作说明。当用户任务与某个技能的描述匹配时，先读取该技能的 SKILL.md 路径，然后再继续执行。不要仅凭技能描述推断完整工作流。
当技能引用相对路径文件时，应以该技能的 SKILL.md 所在目录作为基准目录进行解析。
你可以通过 ${SANDBOX_READ_FILE_TOOL_NAME} 工具来读取完整的技能。
下面是可用的技能：

${skillInfos
  .map((info) =>
    [
      '<skill>',
      `<name>${escapeXml(info.name)}</name>`,
      `<description>${escapeXml(info.description)}</description>`,
      `<directory>${escapeXml(info.directory)}</directory>`,
      `<path>${escapeXml(info.skillMdPath)}</path>`,
      '</skill>'
    ].join('\n')
  )
  .join('\n')}`;
  };
  const buildInputFilesPrompt = () => {
    if (filesInfo.length === 0) return '';

    return `## 对话文件
用户本次对话上传的文件，用途：
1. 普通文档可通过 read_files 读取内容。
2. url 可作为其他工具的模型参数。

${filesInfo
  .map(
    (file) => `<file>
<id>${escapeXml(file.id)}</id>
<name>${escapeXml(file.name)}</name>
<type>${escapeXml(file.type)}</type>
<url>${escapeXml(file.url)}</url>
</file>`
  )
  .join('\n')}`;
  };
  const buildSandboxFileWriteBoundaryPrompt = () => {
    if (!currentWorkingDirectory) return '';

    return `## Sandbox 文件写入边界
生成或修改文件时，必须严格区分系统目录和用户产物目录：
- 用户 Skill 产物根目录：${currentWorkingDirectory}/skills
- 如果任务需要创建或修改用户 Skill，只能写入：${currentWorkingDirectory}/skills/<skill-name>/
- 用户 Skill 主文件必须是：${currentWorkingDirectory}/skills/<skill-name>/SKILL.md
- 禁止写入：${currentWorkingDirectory}/<skill-name>/ 或 ${currentWorkingDirectory}/SKILL.md
- 禁止写入：/home/sandbox/.fastgpt/skills/、~/.fastgpt/skills/ 或任何 .fastgpt/skills/ 路径；这些路径只用于系统内置 Skill。`;
  };
  const reminder = [
    buildSkillsPrompt(),
    buildSandboxFileWriteBoundaryPrompt(),
    buildInputFilesPrompt(),
    currentTime || currentWorkingDirectory
      ? `## 背景信息${currentTime ? `\n当前时间: ${currentTime}` : ''}${
          currentWorkingDirectory ? `\n当前 sandbox 工作目录: ${currentWorkingDirectory}` : ''
        }`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!reminder) return query;

  return `<system-reminder>
依据以下内容完成任务

${reminder}
</system-reminder>
${query}`.trim();
};
