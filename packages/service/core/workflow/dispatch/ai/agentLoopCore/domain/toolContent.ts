import {
  ChatCompletionToolMessageContentPartSchema,
  type ChatCompletionToolMessageContentPart
} from '@fastgpt/global/core/ai/llm/type';
import { providerImageMimeType } from '@fastgpt/global/common/file/constants';

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

const providerImageMimeTypes = providerImageMimeType.split(',').map((item) => item.trim());
const isProviderImageMimeType = (mimeType: string) => providerImageMimeTypes.includes(mimeType);

/** MCP 图片块是否能转换成供应商可消费的视觉输入。 */
const isConvertibleMcpImageBlock = (block: { data?: unknown; mimeType?: unknown }) =>
  typeof block.data === 'string' &&
  block.data.length > 0 &&
  typeof block.mimeType === 'string' &&
  isProviderImageMimeType(block.mimeType);

/**
 * 把模型文本里的图片数据替换成占位，避免同一份图片既进 tool 文本又进 vision part。
 *
 * - MCP `{ type: 'image', data, mimeType }` 只替换真正会被转换的块（栅格格式、data 非空）；
 *   未转换的块保持原样，否则这些内容会在两个通道里同时消失。
 * - `image_url.url` 为 data URI 的 part 只在调用方确认它已通过 content 通道发送时替换
 *   （`maskDataUrlParts`），否则会把唯一一份数据丢掉。
 *
 * 原始结果仍保留在节点响应里供详情展示。
 */
export const maskToolImagePayload = (
  toolResponses: unknown,
  options: { maskDataUrlParts?: boolean } = {}
): unknown => {
  if (!toolResponses || typeof toolResponses !== 'object') return toolResponses;

  const content = (toolResponses as { content?: unknown }).content;
  if (!Array.isArray(content)) return toolResponses;

  let changed = false;
  const maskedContent = content.map((block) => {
    if (!block || typeof block !== 'object') return block;

    const item = block as {
      type?: unknown;
      data?: unknown;
      mimeType?: unknown;
      image_url?: { url?: unknown };
    };

    if (item.type === 'image') {
      if (!isConvertibleMcpImageBlock(item)) return block;
      changed = true;
      return { type: 'image', mimeType: item.mimeType, data: '[image data omitted]' };
    }

    const url = item.image_url?.url;
    if (options.maskDataUrlParts && typeof url === 'string' && url.startsWith('data:')) {
      changed = true;
      return { ...item, image_url: { ...item.image_url, url: '[image data omitted]' } };
    }

    return block;
  });

  return changed ? { ...toolResponses, content: maskedContent } : toolResponses;
};

/**
 * 把 MCP `CallToolResult.content` 的原生内容块转换成 tool content parts。
 *
 * MCP 协议里的图片块是 `{ type: 'image', data, mimeType }`（base64），不是 `image_url`；
 * 直接交给 extractAgentLoopCoreToolContent 会整组校验失败并回退成 JSON 文本，模型拿不到图片。
 * 因此在这里先转成 data URI，再走共享 schema 校验。
 *
 * 只产出图片 part：文本块的内容已经包含在 response JSON 里，重复发送没有意义；
 * 音频、resource 等 MCP 块保持原有文本路径，不做猜测性转换。
 */
export const convertMcpToolContentToToolContent = (
  mcpContent: unknown
): ChatCompletionToolMessageContentPart[] | undefined => {
  if (!Array.isArray(mcpContent)) return;

  const parts: ChatCompletionToolMessageContentPart[] = [];
  for (const block of mcpContent) {
    if (!block || typeof block !== 'object') continue;

    const { type, data, mimeType } = block as {
      type?: unknown;
      data?: unknown;
      mimeType?: unknown;
    };
    if (type !== 'image' || !isConvertibleMcpImageBlock({ data, mimeType })) {
      continue;
    }

    const parsed = ChatCompletionToolMessageContentPartSchema.safeParse({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${data}` }
    });
    // 正常不会失败（url 允许任意字符串）；保留 safeParse 作为 schema 变更时的兜底，
    // 真正的过滤在 isConvertibleMcpImageBlock 的白名单里。
    if (!parsed.success) continue;

    parts.push(parsed.data);
  }

  return parts.length ? parts : undefined;
};
