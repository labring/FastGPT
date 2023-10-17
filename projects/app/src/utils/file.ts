import { getErrText } from './tools';
import { countPromptTokens } from './common/tiktoken';

/**
 * text split into chunks
 * maxLen - one chunk len. max: 3500
 * overlapLen - The size of the before and after Text
 * maxLen > overlapLen
 */
export const splitText2Chunks = ({ text = '', maxLen }: { text: string; maxLen: number }) => {
  const overlapLen = Math.floor(maxLen * 0.2); // Overlap length
  const tempMarker = 'SPLIT_HERE_SPLIT_HERE';

  const stepReg: Record<number, RegExp> = {
    0: /(\n\n)/g,
    1: /([\n])/g,
    2: /([。]|\.\s)/g,
    3: /([！？]|!\s|\?\s)/g,
    4: /([；]|;\s)/g,
    5: /([，]|,\s)/g
  };

  const splitTextRecursively = ({ text = '', step }: { text: string; step: number }) => {
    if (text.length <= maxLen) {
      return [text];
    }
    const reg = stepReg[step];

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

    // split text by delimiters
    const splitTexts = text
      .replace(reg, `$1${tempMarker}`)
      .split(`${tempMarker}`)
      .filter((part) => part);

    let chunks: string[] = [];
    let preChunk = '';
    let chunk = '';
    for (let i = 0; i < splitTexts.length; i++) {
      let text = splitTexts[i];
      // chunk over size
      if (text.length > maxLen) {
        const innerChunks = splitTextRecursively({ text, step: step + 1 });
        if (innerChunks.length === 0) continue;
        // If the last chunk is too small, it is merged into the next chunk
        if (innerChunks[innerChunks.length - 1].length <= maxLen * 0.5) {
          text = innerChunks.pop() || '';
          chunks = chunks.concat(innerChunks);
        } else {
          chunks = chunks.concat(innerChunks);
          continue;
        }
      }

      chunk += text;
      // size over lapLen, push it to next chunk
      if (chunk.length > maxLen - overlapLen) {
        preChunk += text;
      }
      if (chunk.length >= maxLen) {
        chunks.push(chunk);
        chunk = preChunk;
        preChunk = '';
      }
    }

    if (chunk && !chunks[chunks.length - 1].endsWith(chunk)) {
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
