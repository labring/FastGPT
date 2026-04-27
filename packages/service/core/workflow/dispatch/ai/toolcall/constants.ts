import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChildResponseItemType } from './type';
import { SANDBOX_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/constants';

export const getSandboxToolWorkflowResponse = ({
  name,
  logo,
  toolId = SANDBOX_TOOL_NAME,
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
  return {
    flowResponses: [
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
    ],
    flowUsages: [],
    runTimes: 0
  };
};
