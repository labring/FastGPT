import { getErrText } from './tools';
import { countPromptTokens } from './common/tiktoken';

/**
 * text split into chunks
 * maxLen - one chunk len. max: 3500
 * overlapLen - The size of the before and after Text
 * maxLen > overlapLen
 */
export const splitText2Chunks = ({ text, maxLen }: { text: string; maxLen: number }) => {
  const overlapLen = Math.floor(maxLen * 0.25); // Overlap length

  try {
    const splitTexts = text.split(/(?<=[。！？；.!?;\n])/g);
    const chunks: string[] = [];

    let preChunk = '';
    let chunk = '';
    for (let i = 0; i < splitTexts.length; i++) {
      const text = splitTexts[i];
      chunk += text;
      if (chunk.length > maxLen - overlapLen) {
        preChunk += text;
      }
      if (chunk.length >= maxLen) {
        chunks.push(chunk);
        chunk = preChunk;
        preChunk = '';
      }
    }

    if (chunk) {
      chunks.push(chunk);
    }

    const tokens = chunks.reduce((sum, chunk) => sum + countPromptTokens(chunk, 'system'), 0);

    return {
      chunks,
      tokens
    };
  } catch (err) {
    throw new Error(getErrText(err));
  }
};

/* simple text, remove chinese space and extra \n */
export const simpleText = (text: string) => {
  text = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  text = text.replace(/\n{2,}/g, '\n');
  text = text.replace(/\s{2,}/g, ' ');

  text = text.replace(/[\x00-\x08]/g, ' ');

  return text;
};
