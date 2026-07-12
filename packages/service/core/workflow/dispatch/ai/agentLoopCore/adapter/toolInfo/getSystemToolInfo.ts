import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getSandboxToolInfo } from '../../../../../../ai/sandbox/interface/toolCall';
import { READ_FILES_TOOL_NAME } from '../../../../../../ai/llm/agentLoop/interface';
import { DATASET_SEARCH_TOOL_NAME } from '../../../../../../ai/llm/agentLoop/interface';
import type {
  AgentLoopCoreSystemToolInfo,
  GetAgentLoopCoreToolInfoParams
} from '../../domain/toolInfo';

/**
 * 统一查询 agent-loop system tool 的展示信息。
 *
 * Workflow Agent 和 ToolCall 都需要在 SSE、assistantResponses、nodeResponse 中展示
 * read_files/sandbox/dataset_search。这里集中处理名称和头像，避免两边分别维护兜底逻辑。
 */
export const getAgentLoopCoreSystemToolInfo = ({
  name,
  lang
}: GetAgentLoopCoreToolInfoParams): AgentLoopCoreSystemToolInfo | undefined => {
  const sandboxToolInfo = getSandboxToolInfo(name, lang);
  if (sandboxToolInfo) {
    return {
      type: 'sandbox',
      name: sandboxToolInfo.name,
      avatar: sandboxToolInfo.avatar,
      toolDescription: sandboxToolInfo.toolDescription
    };
  }

  if (name === READ_FILES_TOOL_NAME || name === DATASET_SEARCH_TOOL_NAME) {
    const info = getSystemToolInfo(name, lang);
    return {
      type: name === READ_FILES_TOOL_NAME ? 'file' : 'datasetSearch',
      name: info?.name || name,
      avatar: info?.avatar,
      toolDescription: info?.toolDescription || info?.name || name
    };
  }

  return undefined;
};
