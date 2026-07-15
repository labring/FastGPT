export enum SseResponseEventEnum {
  error = 'error',
  workflowDuration = 'workflowDuration',
  chatTitle = 'chatTitle',
  answer = 'answer',
  fastAnswer = 'fastAnswer',
  flowNodeStatus = 'flowNodeStatus',
  flowNodeResponse = 'flowNodeResponse',

  toolCall = 'toolCall',
  toolParams = 'toolParams',
  toolResponse = 'toolResponse',

  flowResponses = 'flowResponses',
  updateVariables = 'updateVariables',

  interactive = 'interactive',

  plan = 'plan',
  planStatus = 'planStatus',

  sandboxStatus = 'sandboxStatus',
  skillCall = 'skillCall'
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
