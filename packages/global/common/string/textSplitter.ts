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
  customReg?: string[];
  countTokens?: boolean;
}): {
  chunks: string[];
  tokens: number;
  overlapRatio?: number;
} => {
  let { text = '', chunkLen, overlapRatio = 0.2, customReg = [], countTokens = true } = props;
  const splitMarker = 'SPLIT_HERE_SPLIT_HERE';
  const codeBlockMarker = 'CODE_BLOCK_LINE_MARKER';
  const overlapLen = Math.round(chunkLen * overlapRatio);

  // replace code block all \n to codeBlockMarker
  text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, function (match) {
    return match.replace(/\n/g, codeBlockMarker);
  });

  // The larger maxLen is, the next sentence is less likely to trigger splitting
  const stepReges: { reg: RegExp; maxLen: number }[] = [
    ...customReg.map((text) => ({ reg: new RegExp(`(${text})`, 'g'), maxLen: chunkLen * 1.4 })),
    { reg: /^(#\s[^\n]+)\n/gm, maxLen: chunkLen * 1.2 },
    { reg: /^(##\s[^\n]+)\n/gm, maxLen: chunkLen * 1.2 },
    { reg: /^(###\s[^\n]+)\n/gm, maxLen: chunkLen * 1.2 },
    { reg: /^(####\s[^\n]+)\n/gm, maxLen: chunkLen * 1.2 },

    { reg: /([\n]([`~]))/g, maxLen: chunkLen * 4 }, // code block
    { reg: /([\n](?!\s*[\*\-|>0-9]))/g, maxLen: chunkLen * 2 }, // (?![\*\-|>`0-9]): markdown special char
    { reg: /([\n])/g, maxLen: chunkLen * 1.2 },

    { reg: /([。]|([a-zA-Z])\.\s)/g, maxLen: chunkLen * 1.2 },
    { reg: /([！]|!\s)/g, maxLen: chunkLen * 1.2 },
    { reg: /([？]|\?\s)/g, maxLen: chunkLen * 1.4 },
    { reg: /([；]|;\s)/g, maxLen: chunkLen * 1.6 },
    { reg: /([，]|,\s)/g, maxLen: chunkLen * 2 }
  ];

  const customRegLen = customReg.length;
  const checkIsCustomStep = (step: number) => step < customRegLen;
  const checkIsMarkdownSplit = (step: number) => step >= customRegLen && step <= 3 + customRegLen;
  const checkIndependentChunk = (step: number) => step >= customRegLen && step <= 4 + customRegLen;
  const checkForbidOverlap = (step: number) => step <= 6 + customRegLen;

  // if use markdown title split, Separate record title title
  const getSplitTexts = ({ text, step }: { text: string; step: number }) => {
    if (step >= stepReges.length) {
      return [
        {
          text,
          title: ''
        }
      ];
    }

    const isCustomSteep = checkIsCustomStep(step);
    const isMarkdownSplit = checkIsMarkdownSplit(step);
    const independentChunk = checkIndependentChunk(step);

    const { reg } = stepReges[step];

    const splitTexts = text
      .replace(
        reg,
        (() => {
          if (isCustomSteep) return splitMarker;
          if (independentChunk) return `${splitMarker}$1`;
          return `$1${splitMarker}`;
        })()
      )
      .split(`${splitMarker}`)
      .filter((part) => part.trim());

    return splitTexts
      .map((text) => {
        const matchTitle = isMarkdownSplit ? text.match(reg)?.[0] || '' : '';

        return {
          text: isMarkdownSplit ? text.replace(matchTitle, '') : text,
          title: matchTitle
        };
      })
      .filter((item) => item.text.trim());
  };

  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkLen * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
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
    lastText,
    mdTitle = ''
  }: {
    text: string;
    step: number;
    lastText: string;
    mdTitle: string;
  }): string[] => {
    const independentChunk = checkIndependentChunk(step);
    const isCustomStep = checkIsCustomStep(step);

    // oversize
    if (step >= stepReges.length) {
      if (text.length < chunkLen * 3) {
        return [text];
      }
      // use slice-chunkLen to split text
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkLen - overlapLen) {
        chunks.push(`${mdTitle}${text.slice(i, i + chunkLen)}`);
      }
      return chunks;
    }

    // split text by special char
    const splitTexts = getSplitTexts({ text, step });

    const maxLen = splitTexts.length > 1 ? stepReges[step].maxLen : chunkLen;
    const minChunkLen = chunkLen * 0.7;
    const miniChunkLen = 30;
    // console.log(splitTexts, stepReges[step].reg);

    const chunks: string[] = [];
    for (let i = 0; i < splitTexts.length; i++) {
      const item = splitTexts[i];
      const currentTitle = `${mdTitle}${item.title}`;

      const currentText = item.text;
      const currentTextLen = currentText.length;
      const lastTextLen = lastText.length;
      const newText = lastText + currentText;
      const newTextLen = lastTextLen + currentTextLen;

      // newText is too large(now, The lastText must be smaller than chunkLen)
      if (newTextLen > maxLen) {
        // lastText greater minChunkLen, direct push it to chunks, not add to next chunk. (large lastText)
        if (lastTextLen > minChunkLen) {
          chunks.push(`${currentTitle}${lastText}`);
          lastText = getOneTextOverlapText({ text: lastText, step }); // next chunk will start with overlayText
          i--;

          continue;
        }

        // split new Text, split chunks must will greater 1 (small lastText)
        const innerChunks = splitTextRecursively({
          text: newText,
          step: step + 1,
          lastText: '',
          mdTitle: currentTitle
        });
        const lastChunk = innerChunks[innerChunks.length - 1];
        // last chunk is too small, concat it to lastText(next chunk start)
        if (!independentChunk && lastChunk.length < minChunkLen) {
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

      // markdown paragraph block: Direct addition; If the chunk size reaches, add a chunk
      if (
        isCustomStep ||
        (independentChunk && newTextLen > miniChunkLen) ||
        newTextLen >= chunkLen
      ) {
        chunks.push(`${currentTitle}${lastText}`);

        lastText = getOneTextOverlapText({ text: lastText, step });
      }
    }

    /* If the last chunk is independent, it needs to be push chunks. */
    if (lastText && chunks[chunks.length - 1] && !chunks[chunks.length - 1].endsWith(lastText)) {
      if (lastText.length < chunkLen * 0.4) {
        chunks[chunks.length - 1] = chunks[chunks.length - 1] + lastText;
      } else {
        chunks.push(`${mdTitle}${lastText}`);
      }
    } else if (lastText && chunks.length === 0) {
      chunks.push(lastText);
    }

    return chunks;
  };

  try {
    const chunks = splitTextRecursively({
      text,
      step: 0,
      lastText: '',
      mdTitle: ''
    }).map((chunk) => chunk?.replaceAll(codeBlockMarker, '\n') || ''); // restore code block

    const tokens = countTokens
      ? chunks.reduce((sum, chunk) => sum + countPromptTokens(chunk, 'system'), 0)
      : 0;

    return {
      chunks,
      tokens
    };
  } catch (err) {
    throw new Error(getErrText(err));
  }
};
