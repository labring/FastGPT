import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { DispatchFlowResponse } from '../type';

// Returns undefined if nestedEnd was never reached (sub-workflow errored early).
export const getNestedEndOutputValue = (response: DispatchFlowResponse): any =>
  response.flowResponses.find((res) => res.moduleType === FlowNodeTypeEnum.nestedEnd)
    ?.loopOutputValue;
