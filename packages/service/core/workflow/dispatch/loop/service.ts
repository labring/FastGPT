import type { DispatchFlowResponse } from '../type';
import { getWorkflowRuntimeSummary } from '../utils/summary';

// Returns undefined if nestedEnd was never reached (sub-workflow errored early).
export const getNestedEndOutputValue = (response: DispatchFlowResponse): any =>
  getWorkflowRuntimeSummary(response).nestedEndOutput;
