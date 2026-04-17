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

  interactive = 'interactive',

  // Agent
  plan = 'plan', // plan response
  stepTitle = 'stepTitle', // step title response

  // Sandbox lifecycle
  sandboxStatus = 'sandboxStatus', // sandbox lifecycle phase notification
  skillCall = 'skillCall', // skill invocation announce (when SKILL.md is loaded)

  // Helperbot
  collectionForm = 'collectionForm', // collection form for HelperBot
  topAgentConfig = 'topAgentConfig' // form data for TopAgent
}

export const StreamResumePhaseEvent = 'resumePhase';
export const StreamResumeCompletedEvent = 'resumeCompleted';
export const StreamResumeUnavailableEvent = 'resumeUnavailable';

export enum StreamResumePhaseEnum {
  catchup = 'catchup',
  live = 'live'
}

export enum StreamResumeUnavailableReasonEnum {
  memoryPressure = 'memoryPressure',
  mirrorUnavailable = 'mirrorUnavailable'
}

export enum DispatchNodeResponseKeyEnum {
  answerText = 'answerText', // answer text
  reasoningText = 'reasoningText', // reasoning text

  skipHandleId = 'skipHandleId', // skip handle id
  nodeResponse = 'responseData', // run node response
  nodeResponses = 'nodeResponses', // node responses
  childrenResponses = 'childrenResponses', // Some nodes make recursive calls that need to be returned
  toolResponses = 'toolResponses', // The result is passed back to the tool node for use
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

// Interactive
export const ConfirmPlanAgentText = 'CONFIRM';
