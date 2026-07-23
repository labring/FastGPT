import type { AgentLoopReadFileExecutor } from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreToolProvider } from '../../agentLoopCore/interface';
import type { UseUserContextResult } from '../adapter/userContext';
import type { ToolDispatchContext } from '../sub/utils';
import type { SubAppRuntimeType } from '../type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export type WorkflowAgentToolProviderContext = ToolDispatchContext & {
  currentFiles: UseUserContextResult['currentFiles'];
};

export type WorkflowAgentToolProvider = AgentLoopCoreToolProvider<
  SubAppRuntimeType,
  WorkflowInteractiveResponseType
> & {
  readFileExecutor?: AgentLoopReadFileExecutor;
  readFileMaxFileAmount: number;
  datasetSearchExecutor?: AgentLoopDatasetSearchExecutor;
  currentInputFiles: string[];
};
