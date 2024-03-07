export enum sseResponseEventEnum {
  error = 'error',
  answer = 'answer', // animation stream
  response = 'response', // direct response, not animation
  moduleStatus = 'moduleStatus',
  toolCall = 'toolCall', // tool start
  toolParams = 'toolParams', // tool params return
  toolResponse = 'toolResponse', // tool response return
  appStreamResponse = 'appStreamResponse' // sse response request
}
