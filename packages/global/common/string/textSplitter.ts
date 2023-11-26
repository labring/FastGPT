import { getErrText } from '../error/utils';
import { countPromptTokens } from './tiktoken';

/**
 * text split into chunks
 * maxLen - one chunk len. max: 3500
 * overlapLen - The size of the before and after Text
 * maxLen > overlapLen
 * markdown
 */
export const splitText2Chunks = (props: { text: string; maxLen: number; overlapLen?: number }) => {
  const { text = '', maxLen, overlapLen = Math.floor(maxLen * 0.2) } = props;
  const tooSmallLen = Math.floor(maxLen * 0.7);
  const tooLargeLen = Math.floor(maxLen * 1.4);
  const tempMarker = 'SPLIT_HERE_SPLIT_HERE';

  const stepReg: Record<number, RegExp> = {
    0: /^(#\s[^\n]+)\n/gm,
    1: /^(##\s[^\n]+)\n/gm,
    2: /^(###\s[^\n]+)\n/gm,
    3: /^(####\s[^\n]+)\n/gm,

    4: /(\n\n)/g,
    5: /([\n])/g,
    6: /([。]|(?!<[^a-zA-Z])\.\s)/g,
    7: /([！？]|!\s|\?\s)/g,
    8: /([；]|;\s)/g,
    9: /([，]|,\s)/g
  };

  const getOverlapText = (chunkTexts: string[] = []): string => {
    let overlapText: string = '';
    const getOverlapTextRecursively = (chunkTexts: string[], endIdx: number): string => {
      if (endIdx === -1 || overlapText.length >= overlapLen) return overlapText;
      overlapText = chunkTexts[endIdx] + overlapText;
      return getOverlapTextRecursively(chunkTexts, endIdx - 1);
    };

    return getOverlapTextRecursively(chunkTexts, chunkTexts.length - 1);
  };

  const splitTextRecursively = ({ text = '', step }: { text: string; step: number }) => {
    if (text.length <= maxLen) {
      return [text];
    }
    const reg = stepReg[step];
    const isMarkdownSplit = step < 4;

    if (!reg) {
      // use slice-maxLen to split text
      const chunks: string[] = [];
      let chunk = '';
      for (let i = 0; i < text.length; i += maxLen - overlapLen) {
        chunk = text.slice(i, i + maxLen);
        chunks.push(chunk);
      }
      return chunks;
    }

    // split text by special char
    const splitTexts = (() => {
      if (!reg.test(text)) {
        return [text];
      }
      return text
        .replace(reg, isMarkdownSplit ? `${tempMarker}$1` : `$1${tempMarker}`)
        .split(`${tempMarker}`)
        .filter((part) => part);
    })();

    let chunks: string[] = [];
    let chunkTexts: string[] = [];
    let chunk: string = '';
    for (let i = 0; i < splitTexts.length; i++) {
      let text = splitTexts[i];
      // next chunk is too large / new chunk is too large(The current chunk must be smaller than maxLen)
      if (text.length > maxLen || chunk.length + text.length > tooLargeLen) {
        let innerChunks: string[] | undefined = [];
        if (chunk.length <= tooSmallLen) {
          innerChunks = splitTextRecursively({ text: chunk + text, step: step + 1 });
        } else {
          // last chunk is too large, push it to chunks, not add to next chunk
          chunks.push(chunk);
          // size overlapLen, push it to next chunk
          innerChunks = splitTextRecursively({
            text: isMarkdownSplit ? text : getOverlapText(chunkTexts) + text,
            step: step + 1
          });
        }
        chunk = '';
        chunkTexts = [];
        if (innerChunks.length === 0) continue;
        // If the last chunk is too small, it is merged into the next chunk
        if (innerChunks[innerChunks.length - 1].length <= tooSmallLen) {
          text = innerChunks.pop() || '';
          chunks = chunks.concat(innerChunks);
        } else {
          chunks = chunks.concat(innerChunks);
          continue;
        }
      }

      chunk += text;
      chunkTexts.push(text);
      if (chunk.length >= maxLen) {
        chunks.push(chunk);
        chunk = isMarkdownSplit ? '' : getOverlapText(chunkTexts);
        chunkTexts = [];
      }
    }

    /* If the last chunk is independent, it needs to be push chunks. */
    if (chunk && !chunks[chunks.length - 1]?.endsWith(chunk)) {
      chunks.push(chunk);
    }
    return chunks;
  };

  try {
    const chunks = splitTextRecursively({ text, step: 0 });

    const tokens = chunks.reduce((sum, chunk) => sum + countPromptTokens(chunk, 'system'), 0);

    return {
      chunks,
      tokens
    };
  } catch (err) {
    throw new Error(getErrText(err));
  }
};
