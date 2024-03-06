export enum sseResponseEventEnum {
  error = 'error',
  answer = 'answer', // animation stream
  response = 'response', // direct response, not animation
  moduleStatus = 'moduleStatus',
  toolCall = 'toolCall',
  appStreamResponse = 'appStreamResponse' // sse response request
}
