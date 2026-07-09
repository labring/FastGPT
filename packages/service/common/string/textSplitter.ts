import { defaultMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { getTextValidLength } from '@fastgpt/global/common/string/utils';
import { countPromptTokensInWorker } from '../../worker/countGptMessagesTokens/count';

export const CUSTOM_SPLIT_SIGN = '-----CUSTOM_SPLIT_SIGN-----';

export type SplitProps = {
  text: string;
  chunkSize: number;

  paragraphChunkDeep?: number; // Paragraph deep
  paragraphChunkMinSize?: number; // Paragraph min size, if too small, it will merge

  maxSize?: number;
  overlapRatio?: number;
  customReg?: string[];
  lengthUnit?: 'char' | 'token';
};
export type TextSplitProps = Omit<SplitProps, 'text' | 'chunkSize'> & {
  chunkSize?: number;
};

export type SplitResponse = {
  chunks: string[];
  chars: number;
};

type TextLengthCounter = (text: string) => number;
type SplitTextByLengthLimit = (props: {
  text: string;
  maxLength: number;
  stepLength: number;
  countLength: TextLengthCounter;
}) => string[];

const splitTextByCharLengthLimit: SplitTextByLengthLimit = ({ text, maxLength, stepLength }) => {
  const chunks: string[] = [];
  const chunkLength = Math.max(1, Math.floor(maxLength));
  const chunkStep = Math.max(1, Math.floor(stepLength));

  for (let i = 0; i < text.length; i += chunkStep) {
    chunks.push(text.slice(i, i + chunkLength));
  }

  return chunks;
};

/**
 * 从文本开头取不超过指定长度的最长前缀。
 *
 * token 模式下字符数和 token 数没有固定比例，不能直接用字符下标推算边界；
 * 这里用二分查找减少 tokenizer 调用次数，并通过 Array.from 按 Unicode code point
 * 切分，避免把代理对字符截断成非法字符串。
 *
 * 如果单个 code point 都超过 maxLength，会返回空字符串，由调用方决定是报错还是降级。
 */
export const getMaxPrefixByLength = ({
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
 * 从文本结尾取不超过指定长度的最长后缀。
 *
 * 该函数专门服务于 overlap：下一块应复用上一块断点附近的尾部上下文，而不是上一块
 * 开头内容。和前缀查找一样，这里按 Unicode code point 二分，避免 token 模式下用
 * 字符长度误判边界或截断代理对字符。
 *
 * maxLength 小于等于 0 时没有可用 overlap 预算，直接返回空字符串。
 */
export const getMaxSuffixByLength = ({
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
    if (!safeText) {
      throw new Error('Text contains a character that exceeds the token length limit');
    }

    chunks.push(safeText);
    if (safeText.length >= restText.length) break;

    const nextRestWithoutOverlap = restText.slice(safeText.length);
    let nextRestText = nextRestWithoutOverlap;

    if (overlapLength > 0) {
      const overlapText = getMaxSuffixByLength({
        text: safeText,
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

const getTextLengthCounter = (props: SplitProps): TextLengthCounter =>
  props.lengthUnit === 'token' ? countPromptTokensInWorker : getTextValidLength;

const getSplitTextByLengthLimit = (props: SplitProps): SplitTextByLengthLimit =>
  props.lengthUnit === 'token' ? splitTextByCounterLengthLimit : splitTextByCharLengthLimit;

// 判断字符串是否为markdown的表格形式
const strIsMdTable = (str: string) => {
  // 检查是否包含表格分隔符 |
  if (!str.includes('|')) {
    return false;
  }

  const lines = str.split('\n');

  // 检查表格是否至少有两行
  if (lines.length < 2) {
    return false;
  }

  // 检查表头行是否包含 |
  const headerLine = lines[0].trim();
  if (!headerLine.startsWith('|') || !headerLine.endsWith('|')) {
    return false;
  }

  // 检查分隔行是否由 | 和 - 组成
  const separatorLine = lines[1].trim();
  const separatorRegex = /^(\|[\s:]*-+[\s:]*)+\|$/;
  if (!separatorRegex.test(separatorLine)) {
    return false;
  }

  // 检查数据行是否包含 |
  for (let i = 2; i < lines.length; i++) {
    const dataLine = lines[i].trim();
    if (dataLine && (!dataLine.startsWith('|') || !dataLine.endsWith('|'))) {
      return false;
    }
  }

  return true;
};
const markdownTableSplit = (props: SplitProps): SplitResponse => {
  const { text = '', chunkSize, maxSize = defaultMaxChunkSize } = props;
  const countLength = getTextLengthCounter(props);

  // split by rows
  const splitText2Lines = text.split('\n').filter((line) => line.trim());

  // If there are not enough rows to form a table, return directly
  if (splitText2Lines.length < 2) {
    return { chunks: [text], chars: text.length };
  }

  const header = splitText2Lines[0];
  const mdSplitString = splitText2Lines[1];

  const chunks: string[] = [];
  const defaultChunk = `${header}
${mdSplitString}
`;
  let chunk = defaultChunk;

  // 只有表头和分隔行，没有数据行的 markdown table 不生成分块。
  // 这种 chunk 没有可检索内容，继续入库只会生成空语义索引。
  if (splitText2Lines.length === 2) {
    return { chunks: [], chars: 0 };
  }

  /**
   * token 模式下表格行拆分后还要补回表头；这里按“表头 + 内容”的最终文本
   * 做二分兜底，避免只按行内容拆分后，拼回表头又超过 embedding 上限。
   */
  const splitTextWithHeaderLimit = (text: string) => {
    const result: string[] = [];
    let restText = text;

    while (restText) {
      const restChars = Array.from(restText);
      let left = 1;
      let right = restChars.length;
      let bestEnd = 0;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const candidate = restChars.slice(0, mid).join('');

        if (countLength(`${defaultChunk}${candidate}`) <= chunkSize) {
          bestEnd = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      if (bestEnd === 0) {
        throw new Error('Markdown table header leaves no token budget for row content');
      }

      const safeText = restChars.slice(0, bestEnd).join('');
      result.push(`${defaultChunk}${safeText}`);
      restText = restText.slice(safeText.length);
    }

    return result;
  };

  const splitTableLineWithHeader = (line: string) => {
    const contentChunkSize = chunkSize - countLength(defaultChunk);
    if (contentChunkSize <= 0) {
      throw new Error('Markdown table header exceeds token chunk size');
    }

    return commonSplit({
      ...props,
      text: line,
      chunkSize: contentChunkSize,
      maxSize: Math.min(maxSize, contentChunkSize)
    }).chunks.flatMap(splitTextWithHeaderLimit);
  };

  for (let i = 2; i < splitText2Lines.length; i++) {
    const chunkLength = countLength(chunk);
    const nextLineLength = countLength(splitText2Lines[i]);
    const defaultChunkLength = countLength(defaultChunk);

    if (props.lengthUnit === 'token' && defaultChunkLength + nextLineLength > chunkSize) {
      if (chunk !== defaultChunk) {
        chunks.push(chunk);
      }

      chunks.push(...splitTableLineWithHeader(splitText2Lines[i]));
      chunk = defaultChunk;
      continue;
    }

    // Over size
    if (chunkLength + nextLineLength > chunkSize) {
      // 单行非常的长，直接分割
      if (chunkLength > maxSize) {
        const newChunks = commonSplit({
          ...props,
          text: chunk.replace(defaultChunk, '').trim()
        }).chunks;
        chunks.push(...newChunks);
      } else if (chunk !== defaultChunk) {
        // 第一条表格数据行就超过 chunkSize 时，chunk 仍然只有表头。
        // 这时不能先推出 header-only chunk，否则会生成没有可检索内容的分块。
        chunks.push(chunk);
      }

      chunk = defaultChunk;
    }
    chunk += `${splitText2Lines[i]}\n`;
  }

  if (chunk && (chunk !== defaultChunk || chunks.length === 0)) {
    chunks.push(chunk);
  }

  return {
    chunks,
    chars: chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  };
};

/* 
  1. 自定义分隔符：不需要重叠，不需要小块合并
  2. Markdown 标题：不需要重叠；标题嵌套共享，需要小块合并
  3. 特殊 markdown 语法：不需要重叠，需要小块合并
  4. 段落：尽可能保证它是一个完整的段落。
  5. 标点分割：重叠
*/
const commonSplit = (props: SplitProps): SplitResponse => {
  const {
    text: rawText = '',
    chunkSize,
    paragraphChunkDeep = 5,
    paragraphChunkMinSize = 100,
    maxSize = defaultMaxChunkSize,
    overlapRatio = 0.15,
    customReg = []
  } = props;
  const countLength = getTextLengthCounter(props);
  const splitTextByLengthLimit = getSplitTextByLengthLimit(props);
  let text = rawText;

  const splitMarker = 'SPLIT_HERE_SPLIT_HERE';
  const codeBlockMarker = 'CODE_BLOCK_LINE_MARKER';
  const overlapLen = Math.round(chunkSize * overlapRatio);
  // 代码块需要尽量保留完整性，但不能直接使用模型 maxSize，否则大段正文包在 ```json/markdown``` 中会绕过 chunkSize 形成超大分块。
  const maxCodeBlockChunks = 4;
  const codeBlockMaxLen = Math.min(maxSize, chunkSize * maxCodeBlockChunks);
  const strIsCodeBlock = (str: string) => /^(```[\s\S]*```|~~~[\s\S]*~~~)$/.test(str.trim());

  // 特殊模块处理
  // 1. 代码块处理 - 去除空字符
  // replace code block all \n to codeBlockMarker
  text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, function (match) {
    return match.replace(/\n/g, codeBlockMarker);
  });

  // replace invalid \n
  text = text.replace(/(\r?\n|\r){3,}/g, '\n\n\n');

  // The larger maxLen is, the next sentence is less likely to trigger splitting
  const customRegLen = customReg.length;
  const markdownIndex = paragraphChunkDeep - 1;
  const forbidOverlapIndex = customRegLen + markdownIndex + 4;

  const markdownHeaderRules = ((deep?: number): { reg: RegExp; maxLen: number }[] => {
    if (!deep || deep === 0) return [];

    const maxDeep = Math.min(deep, 8); // Maximum 8 levels
    const rules: { reg: RegExp; maxLen: number }[] = [];

    for (let i = 1; i <= maxDeep; i++) {
      const hashSymbols = '#'.repeat(i);
      rules.push({
        reg: new RegExp(`^(${hashSymbols}\\s[^\\n]+\\n)`, 'gm'),
        maxLen: chunkSize
      });
    }

    return rules;
  })(paragraphChunkDeep);

  const stepReges: { reg: RegExp | string; maxLen: number; splitAround?: boolean }[] = [
    ...customReg.map((text) => ({
      reg: text.replace(/\\n/g, '\n'),
      maxLen: maxSize
    })),
    ...markdownHeaderRules,

    // 代码块需要独立成段，避免吞掉前面大段正文；短代码块仍尽量保持完整。
    { reg: /(^|\n)(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, maxLen: codeBlockMaxLen, splitAround: true },
    // HTML Table tag 尽可能保障完整
    {
      reg: /(\n\|(?:[^\n|]*\|)+\n\|(?:[:\-\s]*\|)+\n(?:\|(?:[^\n|]*\|)*\n)*)/g,
      maxLen: chunkSize
    }, // Markdown Table 尽可能保证完整性
    { reg: /(\n{2,})/g, maxLen: chunkSize },
    { reg: /([\n])/g, maxLen: chunkSize },
    // ------ There's no overlap on the top
    { reg: /([。]|([a-zA-Z])\.\s)/g, maxLen: chunkSize },
    { reg: /([！]|!\s)/g, maxLen: chunkSize },
    { reg: /([？]|\?\s)/g, maxLen: chunkSize },
    { reg: /([；]|;\s)/g, maxLen: chunkSize },
    { reg: /([，]|,\s)/g, maxLen: chunkSize }
  ];

  const checkIsCustomStep = (step: number) => step < customRegLen;
  const checkIsMarkdownSplit = (step: number) =>
    step >= customRegLen && step <= markdownIndex + customRegLen;
  const checkForbidOverlap = (step: number) => step <= forbidOverlapIndex;

  // if use markdown title split, Separate record title
  const getSplitTexts = ({ text, step }: { text: string; step: number }) => {
    if (step >= stepReges.length) {
      return [
        {
          text,
          title: '',
          chunkMaxSize: chunkSize
        }
      ];
    }

    const isCustomStep = checkIsCustomStep(step);
    const isMarkdownSplit = checkIsMarkdownSplit(step);

    const { reg, maxLen, splitAround } = stepReges[step];

    const replaceText = (() => {
      if (typeof reg === 'string') {
        let tmpText = text;
        reg.split('|').forEach((itemReg) => {
          tmpText = tmpText.replaceAll(
            itemReg,
            (() => {
              if (isCustomStep) return splitMarker;
              if (isMarkdownSplit) return `${splitMarker}$1`;
              return `$1${splitMarker}`;
            })()
          );
        });
        return tmpText;
      }

      return text.replace(
        reg,
        (() => {
          if (isCustomStep) return splitMarker;
          if (isMarkdownSplit) return `${splitMarker}$1`;
          if (splitAround) return `${splitMarker}$&${splitMarker}`;
          return `$1${splitMarker}`;
        })()
      );
    })();

    const splitTexts = replaceText.split(splitMarker).filter((part) => part.trim());

    return splitTexts
      .map((text) => {
        const matchTitle = isMarkdownSplit ? text.match(reg)?.[0] || '' : '';
        // 如果一个分块没有匹配到，则使用默认块大小，否则使用最大块大小
        const chunkMaxSize = (() => {
          if (isCustomStep) return maxLen;
          return text.match(reg) === null ? chunkSize : maxLen;
        })();

        return {
          text: isMarkdownSplit ? text.replace(matchTitle, '') : text,
          title: matchTitle,
          chunkMaxSize
        };
      })
      .filter((item) => !!item.title || !!item.text?.trim());
  };

  /* Gets the overlap at the end of a text as the beginning of the next block */
  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
      const newText = currentText + overlayText;
      const newTextLen = countLength(newText);

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
    parentTitle = ''
  }: {
    text: string;
    step: number;
    lastText: string; // 上一个分块末尾数据会通过这个参数传入。
    parentTitle: string;
  }): string[] => {
    const isMarkdownStep = checkIsMarkdownSplit(step);
    const isCustomStep = checkIsCustomStep(step);
    const forbidConcat = isCustomStep; // forbid=true时候，lastText肯定为空
    let lastTextIsOverlap = false;

    // Over step
    if (step >= stepReges.length) {
      // Merge lastText with current text to prevent data loss
      const combinedText = lastText + text;
      const combinedLength = countLength(combinedText);

      if (combinedLength < maxSize) {
        return [combinedText];
      }
      return splitTextByLengthLimit({
        text: combinedText,
        maxLength: chunkSize,
        stepLength: chunkSize - overlapLen,
        countLength
      });
    }

    // split text by special char
    const splitTexts = getSplitTexts({ text, step });

    const chunks: string[] = [];

    for (let i = 0; i < splitTexts.length; i++) {
      const item = splitTexts[i];

      const maxLen = item.chunkMaxSize; // 当前块最大长度

      const lastTextLen = countLength(lastText);
      const currentText = item.text;
      const newText = lastText + currentText;
      const newTextLen = countLength(newText);

      // 代码块独立处理，避免“前面正文 + 代码块”被 maxSize 合成超大分块。
      if (strIsCodeBlock(currentText)) {
        if (lastTextLen > 0) {
          chunks.push(lastText);
          lastText = '';
          lastTextIsOverlap = false;
        }

        if (countLength(currentText) > maxLen) {
          const restoredCodeBlock = currentText.replaceAll(codeBlockMarker, '\n');

          chunks.push(
            ...splitTextByLengthLimit({
              text: restoredCodeBlock,
              maxLength: chunkSize,
              stepLength: chunkSize,
              countLength
            })
          );
        } else {
          chunks.push(currentText);
        }
        continue;
      }

      // split the current table if it will exceed after adding
      if (strIsMdTable(currentText) && newTextLen > maxLen) {
        if (lastTextLen > 0) {
          chunks.push(lastText);
          lastText = '';
          lastTextIsOverlap = false;
        }

        const { chunks: tableChunks } = markdownTableSplit({
          text: currentText,
          chunkSize: props.lengthUnit === 'token' ? chunkSize : chunkSize * 1.2,
          maxSize,
          lengthUnit: props.lengthUnit
        });

        chunks.push(...tableChunks);
        continue;
      }
      // Markdown 模式下，会强制向下拆分最小块，并再最后一个标题深度，给小块都补充上所有标题（包含父级标题）
      if (isMarkdownStep) {
        // split new Text, split chunks must will greater 1 (small lastText)
        const innerChunks = splitTextRecursively({
          text: newText,
          step: step + 1,
          lastText: '',
          parentTitle: parentTitle + item.title
        });

        // 只有标题，没有内容。
        if (innerChunks.length === 0) {
          chunks.push(`${parentTitle}${item.title}`);
          continue;
        }

        // 在合并最深级标题时，需要补充标题
        chunks.push(
          ...innerChunks.map(
            (chunk) =>
              step === markdownIndex + customRegLen ? `${parentTitle}${item.title}${chunk}` : chunk // 合并进 Markdown 分块时，需要补标题
          )
        );

        continue;
      }

      // newText is too large(now, The lastText must be smaller than chunkSize)
      if (newTextLen > maxLen) {
        const minChunkLen = maxLen * 0.8; // 当前块最小长度
        const maxChunkLen = maxLen * 1.2; // 当前块最大长度

        // 新文本没有非常大，直接认为它是一个新的块
        if (newTextLen < maxChunkLen && (props.lengthUnit !== 'token' || newTextLen <= maxSize)) {
          chunks.push(newText);
          lastText = getOneTextOverlapText({ text: newText, step }); // next chunk will start with overlayText
          lastTextIsOverlap = true;
          continue;
        }
        // 上一个文本块已经挺大的，单独做一个块
        if (lastTextLen > minChunkLen) {
          chunks.push(lastText);

          lastText = getOneTextOverlapText({ text: lastText, step }); // next chunk will start with overlayText
          lastTextIsOverlap = true;

          i--;
          continue;
        }

        // 说明是当前文本比较大，需要进一步拆分

        // 把新的文本块进行一个拆分，并追加到 latestText 中
        const innerChunks = splitTextRecursively({
          text: currentText,
          step: step + 1,
          lastText,
          parentTitle: parentTitle + item.title
        });
        const lastChunk = innerChunks[innerChunks.length - 1];

        if (!lastChunk) continue;

        // last chunk is too small, concat it to lastText(next chunk start)
        if (countLength(lastChunk) < minChunkLen) {
          chunks.push(...innerChunks.slice(0, -1));
          lastText = lastChunk;
          lastTextIsOverlap = false;
          continue;
        }

        // Last chunk is large enough
        chunks.push(...innerChunks);
        // compute new overlapText
        lastText = getOneTextOverlapText({
          text: lastChunk,
          step
        });
        lastTextIsOverlap = true;
        continue;
      }

      // New text is small

      // Not overlap
      if (forbidConcat) {
        chunks.push(currentText);
        continue;
      }

      lastText = newText;
      lastTextIsOverlap = false;
    }

    /* If the last chunk is independent, it needs to be push chunks. */
    const lastChunk = chunks[chunks.length - 1];
    const shouldPushLastText =
      props.lengthUnit === 'token'
        ? !lastTextIsOverlap || !lastChunk?.endsWith(lastText)
        : !lastChunk?.endsWith(lastText);

    if (lastText && lastChunk && shouldPushLastText) {
      if (
        countLength(lastText) < chunkSize * 0.4 &&
        !strIsCodeBlock(lastChunk) &&
        (props.lengthUnit !== 'token' || countLength(lastChunk + lastText) <= maxSize)
      ) {
        chunks[chunks.length - 1] = lastChunk + lastText;
      } else {
        chunks.push(lastText);
      }
    } else if (lastText && chunks.length === 0) {
      // 只分出一个很小的块，则直接追加到末尾（如果大于 1 个块，说明这个小块内容已经被上一个块拿到了）
      chunks.push(lastText);
    }

    return chunks;
  };

  try {
    const chunks = splitTextRecursively({
      text,
      step: 0,
      lastText: '',
      parentTitle: ''
    }).map((chunk) => chunk?.replaceAll(codeBlockMarker, '\n')?.trim() || ''); // restore code block

    const chars = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

    return {
      chunks,
      chars
    };
  } catch (err) {
    throw new Error(getErrText(err));
  }
};

/**
 * text split into chunks
 * chunkSize - one chunk len. max: 3500
 * overlapLen - The size of the before and after Text
 * chunkSize > overlapLen
 * markdown
 */
export const splitText2Chunks = (props: SplitProps): SplitResponse => {
  const { text = '' } = props;
  const splitWithCustomSign = text.split(CUSTOM_SPLIT_SIGN);

  const splitResult = splitWithCustomSign.map((item) => {
    if (strIsMdTable(item)) {
      return markdownTableSplit({ ...props, text: item });
    }

    return commonSplit({ ...props, text: item });
  });

  return {
    chunks: splitResult
      .map((item) => item.chunks)
      .flat()
      .map((chunk) => simpleText(chunk)),
    chars: splitResult.reduce((sum, item) => sum + item.chars, 0)
  };
};
