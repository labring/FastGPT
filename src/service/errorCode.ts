export const openaiError: Record<string, string> = {
  context_length_exceeded: '内容超长了，请重置对话',
  Unauthorized: 'API-KEY 不合法',
  rate_limit_reached: '同时访问用户过多，请稍后再试',
  'Bad Request': '内容太多了~'
};
