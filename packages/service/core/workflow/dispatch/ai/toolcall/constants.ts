import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChildResponseItemType } from './type';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { summarizeRuntimeNodeResponses } from '../../utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const getSandboxToolWorkflowResponse = ({
  name,
  logo,
  toolId = SANDBOX_SHELL_TOOL_NAME,
  input,
  response,
  durationSeconds
}: {
  name: string;
  logo: string;
  toolId?: string;
  input: Record<string, any>;
  response: string;
  durationSeconds: number;
}): ChildResponseItemType => {
  const flowResponses = [
    {
      moduleName: name,
      moduleType: FlowNodeTypeEnum.tool,
      moduleLogo: logo,
      toolId,
      toolInput: input,
      toolRes: response,
      totalPoints: 0,
      id: getNanoid(),
      nodeId: getNanoid(),
      runningTime: durationSeconds
    }
  ];

  return {
    runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, flowResponses),
    builtinNodeResponses: flowResponses,
    flowUsages: [],
    runTimes: 0
  };
};
