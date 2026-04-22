import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { DispatchFlowResponse } from '../type';

/**
 * Extract the output value produced by the nestedEnd node in a sub-workflow
 * response.  Returns undefined when the nestedEnd node was never reached
 * (e.g. the sub-workflow terminated with an error before completion).
 */
export const getNestedEndOutputValue = (response: DispatchFlowResponse): any =>
  response.flowResponses.find((res) => res.moduleType === FlowNodeTypeEnum.nestedEnd)
    ?.loopOutputValue;
