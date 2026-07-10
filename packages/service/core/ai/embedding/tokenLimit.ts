import { countPromptTokens } from '../../../common/string/tiktoken/index';

/**
 * 按格式化后的文本 token 上限，从原始文本里二分出最长安全前缀。
 *
 * 这个函数只做“单条输入截断”，不会把一条文本拆成多条文本。它主要用于
 * embedding query 这类不能扩增输入数量的场景；知识库入库索引需要保留内容时，
 * 应该在上游按 token 分块生成多条 index。
 *
 * `formatText` 用于处理“实际送入 embedding 的文本并不等于原文”的场景，
 * 例如知识库索引会给正文补充集合标题前缀。这里仍只返回原文前缀，由调用方决定如何组装最终文本。
 */
export const truncateTextByFormattedTokenLimit = async ({
  text,
  maxToken,
  formatText = (text) => text,
  currentTokens
}: {
  text: string;
  maxToken: number;
  formatText?: (text: string) => string;
  currentTokens?: number;
}) => {
  const trimmedText = text.trim();
  if (!Number.isFinite(maxToken) || maxToken <= 0) return trimmedText;

  const formattedTokens = currentTokens ?? (await countPromptTokens(formatText(trimmedText)));
  if (!trimmedText || formattedTokens <= maxToken) {
    return trimmedText;
  }

  const textChars = Array.from(trimmedText);
  let left = 1;
  let right = textChars.length;
  let bestEnd = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = textChars.slice(0, mid).join('').trim();
    if (!candidate) {
      left = mid + 1;
      continue;
    }

    if ((await countPromptTokens(formatText(candidate))) <= maxToken) {
      bestEnd = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return textChars.slice(0, bestEnd).join('').trim();
};
