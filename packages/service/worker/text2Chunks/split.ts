import {
  splitText2Chunks,
  type SplitProps,
  type SplitTextByLengthLimit,
  type TextLengthCounter
} from '../../common/string/textSplitter';
import { countPromptTokensInWorker } from '../countGptMessagesTokens/count';

/**
 * 从剩余文本开头取“最长安全前缀”，用于生成当前 chunk。
 *
 * token 模式不能直接按字符下标切 chunk，因为字符数和 token 数不是同一个单位；
 * 这里通过二分减少 tokenizer 调用次数。
 */
const getMaxPrefixByLength = ({
  text,
  maxLength,
  countLength
}: {
  text: string;
  maxLength: number;
  countLength: TextLengthCounter;
}) => {
  if (!text || countLength(text) <= maxLength) return text;

  const textChars = Array.from(text);
  let left = 1;
  let right = textChars.length;
  let bestEnd = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = textChars.slice(0, mid).join('');

    if (countLength(candidate) <= maxLength) {
      bestEnd = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return textChars.slice(0, bestEnd).join('');
};

/**
 * 从当前 chunk 结尾取“最长安全后缀”，用于生成下一块的 overlap。
 *
 * overlap 要承接断点附近的上下文，所以必须取上一块的末尾；如果复用前缀逻辑，
 * 下一块会带上上一块开头内容，反而和切分边界无关。
 */
const getMaxSuffixByLength = ({
  text,
  maxLength,
  countLength
}: {
  text: string;
  maxLength: number;
  countLength: TextLengthCounter;
}) => {
  if (!text || maxLength <= 0) return '';
  if (countLength(text) <= maxLength) return text;

  const textChars = Array.from(text);
  let left = 0;
  let right = textChars.length - 1;
  let bestStart = textChars.length;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const candidate = textChars.slice(mid).join('');

    if (countLength(candidate) <= maxLength) {
      bestStart = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return textChars.slice(bestStart).join('');
};

const splitTextByCounterLengthLimit: SplitTextByLengthLimit = ({
  text,
  maxLength,
  stepLength,
  countLength
}) => {
  if (!text) return [];
  if (!Number.isFinite(maxLength) || maxLength <= 0) return [text];

  const chunks: string[] = [];
  let restText = text;
  // token 模式下 overlap 也必须按同一个计数器计算，不能退回字符长度。
  const overlapLength = Math.max(0, maxLength - Math.max(1, stepLength));

  while (restText) {
    // 这里用二分找“当前剩余文本中最长的安全前缀”，用于兜底拆分超长片段。
    // 和 embedding 的 query 截断不同，这里会继续处理剩余文本并返回多条 chunk。
    const safeText = getMaxPrefixByLength({
      text: restText,
      maxLength,
      countLength
    });
    const chunk = safeText || Array.from(restText)[0] || '';

    chunks.push(chunk);
    if (chunk.length >= restText.length) break;

    const nextRestWithoutOverlap = restText.slice(chunk.length);
    let nextRestText = nextRestWithoutOverlap;

    if (overlapLength > 0) {
      const overlapText = getMaxSuffixByLength({
        text: chunk,
        maxLength: overlapLength,
        countLength
      });
      nextRestText = `${overlapText}${nextRestWithoutOverlap}`;
    }

    // 极端情况下 overlap 可能导致没有推进，直接丢弃 overlap 保证循环收敛。
    restText = nextRestText.length >= restText.length ? nextRestWithoutOverlap : nextRestText;
  }

  return chunks;
};

/**
 * 按 SplitProps 的长度单位执行文本分块。
 * char 模式保持原有字符长度逻辑；token 模式注入 worker tokenizer，供知识库索引场景使用。
 */
export const splitText2ChunksByLengthUnit = (props: SplitProps) => {
  if (props.lengthUnit === 'token') {
    return splitText2Chunks(props, {
      countLength: countPromptTokensInWorker,
      splitTextByLengthLimit: splitTextByCounterLengthLimit
    });
  }

  return splitText2Chunks(props);
};
