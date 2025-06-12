import { FlowNodeInputTypeEnum } from '../node/constant';

export enum SseResponseEventEnum {
  error = 'error',
  workflowDuration = 'workflowDuration', // workflow duration
  answer = 'answer', // animation stream
  fastAnswer = 'fastAnswer', // direct answer text, not animation
  flowNodeStatus = 'flowNodeStatus', // update node status
  flowNodeResponse = 'flowNodeResponse', // node response

  toolCall = 'toolCall', // tool start
  toolParams = 'toolParams', // tool params return
  toolResponse = 'toolResponse', // tool response return
  flowResponses = 'flowResponses', // sse response request
  updateVariables = 'updateVariables',

  interactive = 'interactive' // user select
}

export enum DispatchNodeResponseKeyEnum {
  skipHandleId = 'skipHandleId', // skip handle id
  nodeResponse = 'responseData', // run node response
  nodeDispatchUsages = 'nodeDispatchUsages', // the node bill.
  childrenResponses = 'childrenResponses', // Some nodes make recursive calls that need to be returned
  toolResponses = 'toolResponses', // The result is passed back to the tool node for use
  assistantResponses = 'assistantResponses', // assistant response
  rewriteHistories = 'rewriteHistories', // If have the response, workflow histories will be rewrite
  interactive = 'INTERACTIVE', // is interactive
  runTimes = 'runTimes', // run times
  newVariables = 'newVariables', // new variables
  memories = 'system_memories' // memories
}

export const needReplaceReferenceInputTypeList = [
  FlowNodeInputTypeEnum.reference,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  FlowNodeInputTypeEnum.addInputParam,
  FlowNodeInputTypeEnum.custom
] as string[];
