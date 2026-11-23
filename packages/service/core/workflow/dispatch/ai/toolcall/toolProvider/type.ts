import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopReadFileExecutor } from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreToolProvider } from '../../agentLoopCore/interface';
import type { ToolNodeItemType } from '../type';
import type { ToolInfo } from '../hooks/useToolCatalog';

export type ToolCallToolProvider = AgentLoopCoreToolProvider<
  ToolNodeItemType,
  WorkflowInteractiveResponseType
> & {
  finalMessages: ChatCompletionMessageParam[];
  getToolInfo: (name: string) => ToolInfo | undefined;
  readFileExecutor?: AgentLoopReadFileExecutor;
  readFileMaxFileAmount: number;
  datasetSearchExecutor?: AgentLoopDatasetSearchExecutor;
  /** 本节点所有工具子流程实际返回的运行次数，含正常完成、交互暂停和失败结果。 */
  getToolRunTimes: () => number;
};
