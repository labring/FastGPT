import type { DeployedSkillInfo } from '../../sandbox/interface/runtime';
import {
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SEARCH_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { PendingMainContext, PlanAskPayload } from '../../llm/agentLoop';
import {
  buildAgentInputFilesPrompt,
  buildAgentSandboxFileWriteBoundaryPrompt,
  buildAgentSkillsPrompt,
  type AgentInputFile
} from '../../agent/userContext';

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

export type SkillEditInputFileType = AgentInputFile;

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
  const reminder = [
    buildAgentSkillsPrompt(skillInfos),
    buildAgentSandboxFileWriteBoundaryPrompt({ currentWorkingDirectory }),
    buildAgentInputFilesPrompt({
      files: filesInfo,
      description: '用户在 Skill Detail 对话上传的文件不会自动进入 sandbox 或 workspace。',
      instructions: [
        `读取普通文档内容必须调用 ${SubAppIds.readFiles}，并传入下方对应的 <id>。`,
        '图片、音频和视频在当前模型支持对应能力时已作为多模态输入提供，应直接分析，不要在 sandbox 或 workspace 中查找。',
        `如果必须在 sandbox 中处理媒体文件，使用下方 <url> 显式下载后再处理，不要通过 ${SANDBOX_READ_FILE_TOOL_NAME}、${SANDBOX_SEARCH_TOOL_NAME} 或 ${SANDBOX_SHELL_TOOL_NAME} 猜测本地路径。`,
        'url 也可作为其他工具的模型参数。'
      ]
    }),
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
