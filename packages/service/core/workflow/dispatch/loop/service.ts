import type { DispatchFlowResponse } from '../type';
import { getRuntimeNodeResponseSummary } from '../utils';

// Returns undefined if nestedEnd was never reached (sub-workflow errored early).
export const getNestedEndOutputValue = (response: DispatchFlowResponse): any =>
  getRuntimeNodeResponseSummary(response).nestedEndOutput;
