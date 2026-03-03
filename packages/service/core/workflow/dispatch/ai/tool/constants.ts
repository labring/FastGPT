import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChildResponseItemType } from './type';

export const getMultiplePrompt = (obj: {
  fileCount: number;
  imgCount: number;
  question: string;
}) => {
  const prompt = `Number of session file inputs：
Document：{{fileCount}}
Image：{{imgCount}}
------
{{question}}`;
  return replaceVariable(prompt, obj);
};

export const getSandboxToolWorkflowResponse = ({
  name,
  logo,
  input,
  response,
  durationSeconds
}: {
  name: string;
  logo: string;
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
