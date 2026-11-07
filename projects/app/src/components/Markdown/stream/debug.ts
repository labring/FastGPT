/**
 * 流式 Markdown 开发期调试日志与实例计数器
 * 生产环境自动空转，杜绝额外开销
 */
export const isMarkdownStreamDebugEnabled = process.env.NODE_ENV !== 'production';

let markdownDebugInstanceId = 0;

/**
 * 获取全局自增的调试实例 ID，用于在日志中追踪组件生命周期
 */
export const getMarkdownDebugInstanceId = () => ++markdownDebugInstanceId;

/**
 * 输出格式统一的流式 Markdown 生命周期日志
 */
export const logMarkdownStreamDebug = (event: string, payload: Record<string, unknown>) => {
  if (!isMarkdownStreamDebugEnabled) return;
  console.log(`[MarkdownStreamDebug] ${event}`, JSON.stringify(payload));
};

/**
 * 仅保留 source 尾部摘要信息，避免在调试日志中输出整个几千字的长对话
 */
export const getSourceDebugInfo = (source: string) => ({
  sourceLength: source.length,
  sourceTail: source.slice(-80)
});
