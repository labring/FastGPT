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
  const tempMarker = 'SPLIT_HERE_SPLIT_HERE';

  const stepReg: Record<number, RegExp> = {
    0: /^(#\s[^\n]+)\n/gm,
    1: /^(##\s[^\n]+)\n/gm,
    2: /^(###\s[^\n]+)\n/gm,
    3: /^(####\s[^\n]+)\n/gm,

    4: /(\n\n)/g,
    5: /([\n])/g,
    6: /[。]|(?!<[^a-zA-Z])\.\s/g,
    7: /([！？]|!\s|\?\s)/g,
    8: /([；]|;\s)/g,
    9: /([，]|,\s)/g
  };

  const splitTextRecursively = ({
    text = '',
    step,
    lastChunk,
    overlayChunk
  }: {
    text: string;
    step: number;
    lastChunk: string;
    overlayChunk: string;
  }) => {
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
    const splitTexts = text
      .replace(reg, isMarkdownSplit ? `${tempMarker}$1` : `$1${tempMarker}`)
      .split(`${tempMarker}`)
      .filter((part) => part);

    let chunks: string[] = [];
    for (let i = 0; i < splitTexts.length; i++) {
      let text = splitTexts[i];
      let chunkToken = countPromptTokens(lastChunk, '');
      const textToken = countPromptTokens(text, '');

      // next chunk is too large / new chunk is too large(The current chunk must be smaller than maxLen)
      if (textToken >= maxLen || chunkToken + textToken > maxLen * 1.4) {
        // last chunk is too large, push it to chunks, not add to next chunk
        if (chunkToken > maxLen * 0.7) {
          chunks.push(lastChunk);
          lastChunk = '';
          overlayChunk = '';
        }
        // chunk is small, insert to next chunks
        const innerChunks = splitTextRecursively({
          text,
          step: step + 1,
          lastChunk,
          overlayChunk
        });
        if (innerChunks.length === 0) continue;
        chunks = chunks.concat(innerChunks);
        lastChunk = '';
        overlayChunk = '';
        continue;
      }

      // size less than maxLen, push text to last chunk
      lastChunk += text;
      chunkToken += textToken; // Definitely less than 1.4 * maxLen

      // size over lapLen, push it to next chunk
      if (
        overlapLen !== 0 &&
        !isMarkdownSplit &&
        chunkToken >= maxLen - overlapLen &&
        textToken < overlapLen
      ) {
        overlayChunk += text;
      }
      if (chunkToken >= maxLen) {
        chunks.push(lastChunk);
        lastChunk = overlayChunk;
        overlayChunk = '';
      }
    }

    /* If the last chunk is independent, it needs to be push chunks. */
    if (lastChunk && chunks[chunks.length - 1] && !chunks[chunks.length - 1].endsWith(lastChunk)) {
      chunks.push(lastChunk);
    }

    return chunks;
  };

  try {
    const chunks = splitTextRecursively({ text, step: 0, lastChunk: '', overlayChunk: '' });

    const tokens = chunks.reduce((sum, chunk) => sum + countPromptTokens(chunk, 'system'), 0);

    return {
      chunks,
      tokens
    };
  } catch (err) {
    throw new Error(getErrText(err));
  }
};
