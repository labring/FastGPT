import {
  ChatCompletionToolMessageContentPartSchema,
  type ChatCompletionToolMessageContentPart
} from '@fastgpt/global/core/ai/llm/type';

/**
 * 从工具输出中提取结构化 tool content。
 *
 * 仅接受形如 `{ content: [{ type: 'text' | 'image_url', ... }, ...] }` 的对象输出：
 * content 必须是非空数组，且每个 part 都能通过共享的
 * `ChatCompletionToolMessageContentPartSchema` 校验（含 `image_url.detail` 这类细分字段）。
 *
 * 任一 part 不合法时整体返回 undefined，由调用方按普通文本处理：工具输出的业务数据
 * 可能只是恰好带了一个 content 字段，不能被半解析成请求字段。只有工具显式声明了合法的
 * parts，才作为下一轮模型的视觉输入；不在普通文本里猜测图片。
 */
export const extractAgentLoopCoreToolContent = (
  toolResponses: unknown
): ChatCompletionToolMessageContentPart[] | undefined => {
  if (!toolResponses || typeof toolResponses !== 'object' || Array.isArray(toolResponses)) {
    return;
  }

  const content = (toolResponses as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return;

  const parts: ChatCompletionToolMessageContentPart[] = [];
  for (const item of content) {
    const parsed = ChatCompletionToolMessageContentPartSchema.safeParse(item);
    if (!parsed.success) return;

    // 空文本、空链接没有传递价值，按非法处理，回退到普通文本链路。
    if (parsed.data.type === 'text' ? !parsed.data.text : !parsed.data.image_url.url) {
      return;
    }

    parts.push(parsed.data);
  }

  return parts;
};
