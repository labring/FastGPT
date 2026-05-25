import {
  type ChatCompletionContentPart,
  type ChatCompletionCreateParams,
  type ChatCompletionMessageParam,
  type ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import o200kTokenizer from 'gpt-tokenizer/encoding/o200k_base';

export type CountGptMessagesTokensParams = {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  functionCall?: ChatCompletionCreateParams.Function[];
};

type TokenizerApi = {
  countTokens: (
    input: string,
    options?: {
      disallowedSpecial?: Set<string> | 'all';
      allowedSpecial?: Set<string> | 'all';
    }
  ) => number;
};

const tokenizer: TokenizerApi = o200kTokenizer;
const noDisallowedSpecial = { disallowedSpecial: new Set<string>() };

/**
 * FastGPT 的 worker token 计数统一使用 GPT 现代模型的 o200k_base 编码。
 * 该路径只做上下文预算和缺 usage 时的近似兜底；供应商返回 usage 时仍以 usage 为准。
 */
export const GPT_TOKENIZER_ENCODING = 'o200k_base';

type CountableContentPart = ChatCompletionContentPart | { type: 'refusal'; refusal: string };

/**
 * 将多模态 content part 转成可计数文本。
 *
 * 这里不尝试复刻各家模型对图片、音频、文件的精确计费规则，只把会进入上下文或
 * 明显影响输入规模的字段纳入估算；真实计费仍以模型供应商返回的 usage 为准。
 */
const contentPartToText = (part: CountableContentPart) => {
  if (part.type === 'text') return part.text;
  if (part.type === 'image_url') return part.image_url.url;
  if (part.type === 'input_audio') return part.input_audio.data;
  if (part.type === 'file')
    return [part.file.filename, part.file.file_id, part.file.file_data].filter(Boolean).join(' ');
  if (part.type === 'file_url') return [part.name, part.url].filter(Boolean).join(' ');
  if (part.type === 'refusal') return part.refusal;
  return '';
};

/**
 * 统一把 OpenAI chat content 规整为字符串。
 *
 * 字符串 content 直接计数；数组 content 按 part 拼接，保持和旧方案一致的“近似预算”
 * 语义，避免在不同消息类型间引入额外分隔符导致历史 token 预算明显漂移。
 */
const contentToText = (content: ChatCompletionMessageParam['content'] = '') => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return (content as CountableContentPart[]).map(contentPartToText).join('');
};

const countTextTokens = (text: string) => {
  try {
    return tokenizer.countTokens(text, noDisallowedSpecial);
  } catch {
    // tokenizer 对极少数非法 special token 组合可能抛错，退回字符数保证计费链路不断。
    return text.length;
  }
};

/**
 * 统计普通 prompt 文本 token 数。
 *
 * 该函数只在 token worker 内执行，用于知识库裁剪、embedding/rerank 兜底计费等
 * 近似场景，统一按 o200k_base 估算。
 */
export const countPromptTokensInWorker = (
  prompt: string | ChatCompletionContentPart[] | null | undefined = '',
  role: '' | `${ChatCompletionRequestMessageRoleEnum}` = ''
) => {
  const promptText =
    typeof prompt === 'string' || !prompt ? prompt || '' : prompt.map(contentPartToText).join('');
  const text = `${role}\n${promptText}`.trim();
  // 兼容旧实现：只有传入 role 时才补 chat message 的固定结构开销。
  const supplementaryToken = role ? 4 : 0;

  return countTextTokens(text) + supplementaryToken;
};

const countToolsTokens = (tools?: ChatCompletionTool[] | ChatCompletionCreateParams.Function[]) => {
  if (!tools || tools.length === 0) return 0;

  // 旧方案也是把工具 schema 规整成紧凑文本后估算，避免格式化 JSON 的空白影响预算。
  const toolText = JSON.stringify(tools)
    .replace(/"/g, '')
    .replace(/\n/g, '')
    .replace(/( ){2,}/g, ' ');
  return countTextTokens(toolText);
};

const getAssistantCallText = (message: ChatCompletionMessageParam) => {
  if (message.role !== ChatCompletionRequestMessageRoleEnum.Assistant) return '';

  // assistant 的 tool/function call 参数会进入模型上下文，需要和普通 content 一起计入。
  const toolCallsText =
    message.tool_calls
      ?.map((item) => `${item?.function?.name} ${item?.function?.arguments}`.trim())
      ?.join('') || '';
  const functionCall = message.function_call;
  const functionCallText = `${functionCall?.name || ''} ${functionCall?.arguments || ''}`.trim();

  return `${toolCallsText}${functionCallText}`;
};

/**
 * 在 token worker 内同步统计 Chat messages token 数。
 *
 * 这里保持旧实现的消息常数近似规则，只替换为更快的 GPT tokenizer。
 * 主线程只通过 worker 调用该函数，避免主进程加载 tokenizer rank 常驻内存。
 */
export const countGptMessagesTokensInWorker = ({
  messages,
  tools,
  functionCall
}: CountGptMessagesTokensParams) => {
  return (
    messages.reduce((sum, item, index) => {
      // 只有最后一条消息的 reasoning_content 会继续影响后续上下文预算。
      const reasoningText = index === messages.length - 1 ? item.reasoning_content || '' : '';
      const contentPrompt = contentToText(item.content);
      const callPrompt = getAssistantCallText(item);

      const text = `${item.role}\n${reasoningText}${contentPrompt}${callPrompt}`.trim();
      // 每条带 role 的 chat message 保留旧实现的固定结构开销，降低切换 tokenizer 的行为差异。
      return sum + countTextTokens(text) + (item.role ? 4 : 0);
    }, 0) +
    countToolsTokens(tools) +
    countToolsTokens(functionCall)
  );
};
