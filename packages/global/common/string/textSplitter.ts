import { getErrText } from '../error/utils';
import { countPromptTokens } from './tiktoken';

/**
 * text split into chunks
 * chunkLen - one chunk len. max: 3500
 * overlapLen - The size of the before and after Text
 * chunkLen > overlapLen
 * markdown
 */
export const splitText2Chunks = (props: {
  text: string;
  chunkLen: number;
  overlapRatio?: number;
}): {
  chunks: string[];
  tokens: number;
} => {
  const { text = '', chunkLen, overlapRatio = 0.2 } = props;
  const splitMarker = 'SPLIT_HERE_SPLIT_HERE';
  const overlapLen = Math.round(chunkLen * overlapRatio);

  // The larger maxLen is, the next sentence is less likely to trigger splitting
  const stepReges: { reg: RegExp; maxLen: number }[] = [
    { reg: /^(#\s[^\n]+)\n/gm, maxLen: chunkLen * 1.4 },
    { reg: /^(##\s[^\n]+)\n/gm, maxLen: chunkLen * 1.4 },
    { reg: /^(###\s[^\n]+)\n/gm, maxLen: chunkLen * 1.4 },
    { reg: /^(####\s[^\n]+)\n/gm, maxLen: chunkLen * 1.4 },

    { reg: /([\n]{2})/g, maxLen: chunkLen * 1.4 },
    { reg: /([\n](?![\*\-|>`0-9]))/g, maxLen: chunkLen * 1.8 }, // (?![\*\-|>`0-9]): markdown special char
    { reg: /([\n])/g, maxLen: chunkLen * 1.4 },

    { reg: /([。]|([a-zA-Z])\.\s)/g, maxLen: chunkLen * 1.4 },
    { reg: /([！]|!\s)/g, maxLen: chunkLen * 1.4 },
    { reg: /([？]|\?\s)/g, maxLen: chunkLen * 1.6 },
    { reg: /([；]|;\s)/g, maxLen: chunkLen * 1.8 },
    { reg: /([，]|,\s)/g, maxLen: chunkLen * 2 }
  ];

  const getSplitTexts = ({ text, step }: { text: string; step: number }) => {
    if (step >= stepReges.length) {
      return [text];
    }
    const isMarkdownSplit = step <= 3;
    const { reg } = stepReges[step];

    const splitTexts = text
      .replace(reg, isMarkdownSplit ? `${splitMarker}$1` : `$1${splitMarker}`)
      .split(`${splitMarker}`)
      .filter((part) => part.trim());
    return splitTexts;
  };

  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = step <= 6;
    const maxOverlapLen = chunkLen * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i];
      const newText = currentText + overlayText;
      const newTextLen = newText.length;

      if (newTextLen > overlapLen) {
        if (newTextLen > maxOverlapLen) {
          const text = getOneTextOverlapText({ text: newText, step: step + 1 });
          return text || overlayText;
        }
        return newText;
      }

      overlayText = newText;
    }
    return overlayText;
  };

  const splitTextRecursively = ({
    text = '',
    step,
    lastText
  }: {
    text: string;
    step: number;
    lastText: string;
  }): string[] => {
    // mini text
    if (text.length <= chunkLen) {
      return [text];
    }

    // oversize
    if (step >= stepReges.length) {
      if (text.length < chunkLen * 3) {
        return [text];
      }
      // use slice-chunkLen to split text
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkLen - overlapLen) {
        chunks.push(text.slice(i, i + chunkLen));
      }
      return chunks;
    }

    const { maxLen } = stepReges[step];
    const minChunkLen = chunkLen * 0.7;

    // split text by special char
    const splitTexts = getSplitTexts({ text, step });

    const chunks: string[] = [];
    for (let i = 0; i < splitTexts.length; i++) {
      const currentText = splitTexts[i];
      const currentTextLen = currentText.length;
      const lastTextLen = lastText.length;
      const newText = lastText + currentText;
      const newTextLen = lastTextLen + currentTextLen;

      // newText is too large(now, The lastText must be smaller than chunkLen)
      if (newTextLen > maxLen) {
        // lastText greater minChunkLen, direct push it to chunks, not add to next chunk. (large lastText)
        if (lastTextLen > minChunkLen) {
          chunks.push(lastText);
          lastText = getOneTextOverlapText({ text: lastText, step }); // next chunk will start with overlayText
          i--;
          continue;
        }

        // split new Text, split chunks must will greater 1 (small lastText)
        const innerChunks = splitTextRecursively({
          text: newText,
          step: step + 1,
          lastText: ''
        });
        const lastChunk = innerChunks[innerChunks.length - 1];
        // last chunk is too small, concat it to lastText
        if (lastChunk.length < minChunkLen) {
          chunks.push(...innerChunks.slice(0, -1));
          lastText = lastChunk;
        } else {
          chunks.push(...innerChunks);
          // compute new overlapText
          lastText = getOneTextOverlapText({
            text: lastChunk,
            step
          });
        }
        continue;
      }

      // size less than chunkLen, push text to last chunk. now, text definitely less than maxLen
      lastText = newText;

      // If the chunk size reaches, add a chunk
      if (newTextLen >= chunkLen) {
        chunks.push(lastText);
        lastText = getOneTextOverlapText({ text: lastText, step });
      }
    }

    /* If the last chunk is independent, it needs to be push chunks. */
    if (lastText && chunks[chunks.length - 1] && !chunks[chunks.length - 1].endsWith(lastText)) {
      if (lastText.length < chunkLen * 0.4) {
        chunks[chunks.length - 1] = chunks[chunks.length - 1] + lastText;
      } else {
        chunks.push(lastText);
      }
    }

    return chunks;
  };

  try {
    const chunks = splitTextRecursively({
      text,
      step: 0,
      lastText: ''
    });

    const tokens = chunks.reduce((sum, chunk) => sum + countPromptTokens(chunk, 'system'), 0);

    return {
      chunks,
      tokens
    };
  } catch (err) {
    throw new Error(getErrText(err));
  }
};
