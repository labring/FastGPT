import { FlowNodeInputTypeEnum } from '../node/constant';

export enum DispatchNodeResponseKeyEnum {
  answerText = 'answerText', // answer text
  reasoningText = 'reasoningText', // reasoning text

  skipHandleId = 'skipHandleId', // skip handle id
  nodeResponse = 'responseData', // run node response
  nodeResponses = 'nodeResponses', // node responses
  childrenResponses = 'childrenResponses', // Some nodes make recursive calls that need to be returned
  toolResponse = 'toolResponse', // The result is passed back to the tool node for use
  assistantResponses = 'assistantResponses', // assistant response
  rewriteHistories = 'rewriteHistories', // If have the response, workflow histories will be rewrite
  interactive = 'INTERACTIVE', // is interactive
  runTimes = 'runTimes', // run times
  newVariables = 'newVariables', // new variables
  memories = 'system_memories', // memories
  customFeedbacks = 'customFeedbacks', // custom feedbacks

  /** @deprecated */
  nodeDispatchUsages = 'nodeDispatchUsages' // the node bill.
}

export const needReplaceReferenceInputTypeList = [
  FlowNodeInputTypeEnum.reference,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  FlowNodeInputTypeEnum.addInputParam,
  FlowNodeInputTypeEnum.custom
] as string[];
