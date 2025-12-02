import { defaultMaxChunkSize } from '../../core/dataset/training/utils';
import { getErrText } from '../error/utils';
import { simpleText } from './tools';
import { getTextValidLength } from './utils';

export const CUSTOM_SPLIT_SIGN = '-----CUSTOM_SPLIT_SIGN-----';

export type SplitProps = {
  text: string;
  chunkSize: number;

  paragraphChunkDeep?: number; // Paragraph deep
  paragraphChunkMinSize?: number; // Paragraph min size, if too small, it will merge

  maxSize?: number;
  overlapRatio?: number;
  customReg?: string[];
};
export type TextSplitProps = Omit<SplitProps, 'text' | 'chunkSize'> & {
  chunkSize?: number;
};

export type SplitResponse = {
  chunks: string[];
  chars: number;
};

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
const markdownTableSplit = (props: SplitProps & { headerPrefix?: string }): SplitResponse => {
  let { text = '', chunkSize, headerPrefix = '' } = props;

  // split by rows
  const splitText2Lines = text.split('\n').filter((line) => line.trim());

  // If there are not enough rows to form a table, return directly
  if (splitText2Lines.length < 2) {
    return { chunks: [text], chars: text.length };
  }

  const header = splitText2Lines[0];
  const headerSize = header.split('|').length - 2;

  const mdSplitString = `| ${new Array(headerSize > 0 ? headerSize : 1)
    .fill(0)
    .map(() => '---')
    .join(' | ')} |`;

  const chunks: string[] = [];
  let chunk = `${headerPrefix}${header}
${mdSplitString}
`;

  for (let i = 2; i < splitText2Lines.length; i++) {
    const chunkLength = getTextValidLength(chunk);
    const nextLineLength = getTextValidLength(splitText2Lines[i]);

    // Over size
    if (chunkLength + nextLineLength > chunkSize) {
      chunks.push(chunk);
      chunk = `${headerPrefix}${header}
${mdSplitString}
`;
    }
    chunk += `${splitText2Lines[i]}\n`;
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return {
    chunks,
    chars: chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  };
};

// 判断字符串是否为HTML的表格形式
const strIsHtmlTable = (str: string) => {
  const trimmedStr = str.trim();
  
  // 检查是否以 <table 开头（严格检查）
  if (!trimmedStr.match(/^<table[\s>]/i)) {
    return false;
  }
  
  // 检查是否以 </table> 结尾（严格检查）
  if (!trimmedStr.endsWith('</table>')) {
    return false;
  }

  // 检查是否包含 tr 标签
  if (!str.includes('<tr')) {
    return false;
  }

  // 简单验证：至少包含一个 td 或 th
  if (!str.includes('<td') && !str.includes('<th')) {
    return false;
  }

  return true;
};
const htmlTableSplit = (props: SplitProps & { headerPrefix?: string }): SplitResponse => {
  let { text = '', chunkSize, headerPrefix = '' } = props;

  try {
    // 提取完整的 table 标签及其属性
    const tableMatch = text.match(/<table[^>]*>/);
    const tableOpenTag = tableMatch ? tableMatch[0] : '<table>';
    const tableCloseTag = '</table>';

    // 提取所有 tr 标签
    const trMatches = text.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
    if (!trMatches || trMatches.length === 0) {
      return { chunks: [text], chars: text.length };
    }

    // 第一个 tr 作为表头（可能在 thead 中，也可能直接在 tbody 中）
    const headerRow = trMatches[0];

    // 提取 thead（如果存在）
    const theadMatch = text.match(/<thead[^>]*>[\s\S]*?<\/thead>/);
    const theadContent = theadMatch ? theadMatch[0] : '';

    const chunks: string[] = [];
    let chunk = `${headerPrefix}${tableOpenTag}\n`;

    // 如果有 thead，使用 thead；否则使用第一个 tr
    if (theadContent) {
      chunk += `${theadContent}\n<tbody>\n`;
    } else {
      chunk += `<tbody>\n${headerRow}\n`;
    }

    // 从第二个 tr 开始遍历（如果有 thead 则从第一个开始）
    const startIndex = theadContent ? 0 : 1;

    for (let i = startIndex; i < trMatches.length; i++) {
      const currentRow = trMatches[i];
      const chunkLength = getTextValidLength(chunk);
      const rowLength = getTextValidLength(currentRow);

      // 超过大小限制，创建新块
      if (chunkLength + rowLength > chunkSize && i > startIndex) {
        chunk += `</tbody>\n${tableCloseTag}`;
        chunks.push(chunk);

        // 开始新块，重新添加表头
        chunk = `${headerPrefix}${tableOpenTag}\n`;
        if (theadContent) {
          chunk += `${theadContent}\n<tbody>\n`;
        } else {
          chunk += `<tbody>\n${headerRow}\n`;
        }
      }

      chunk += `${currentRow}\n`;
    }

    // 添加最后一个块
    if (chunk) {
      chunk += `</tbody>\n${tableCloseTag}`;
      chunks.push(chunk);
    }

    return {
      chunks,
      chars: chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    };
  } catch (error) {
    // 如果解析失败，返回原文本
    return { chunks: [text], chars: text.length };
  }
};

/* 
  1. 自定义分隔符：不需要重叠，不需要小块合并
  2. Markdown 标题：不需要重叠；标题嵌套共享，需要小块合并
  3. 特殊 markdown 语法：不需要重叠，需要小块合并
  4. 段落：尽可能保证它是一个完整的段落。
  5. 标点分割：重叠
*/
const commonSplit = (props: SplitProps): SplitResponse => {
  let {
    text = '',
    chunkSize,
    paragraphChunkDeep = 5,
    paragraphChunkMinSize = 100,
    maxSize = defaultMaxChunkSize,
    overlapRatio = 0.15,
    customReg = []
  } = props;

  const splitMarker = 'SPLIT_HERE_SPLIT_HERE';
  const codeBlockMarker = 'CODE_BLOCK_LINE_MARKER';
  const overlapLen = Math.round(chunkSize * overlapRatio);

  // 特殊模块处理
  // 1. 代码块处理 - 去除空字符
  // replace code block all \n to codeBlockMarker
  text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, function (match) {
    return match.replace(/\n/g, codeBlockMarker);
  });

  // replace invalid \n
  text = text.replace(/(\r?\n|\r){3,}/g, '\n\n\n');
  
  // 确保 HTML 表格前有换行符
  text = text.replace(/([^\n])(<table)/gi, '$1\n$2');

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

  const stepReges: { reg: RegExp | string; maxLen: number }[] = [
    ...customReg.map((text) => ({
      reg: text.replace(/\\n/g, '\n'),
      maxLen: chunkSize
    })),
    ...markdownHeaderRules,

    { reg: /([\n](```[\s\S]*?```|~~~[\s\S]*?~~~))/g, maxLen: maxSize }, // code block
    { reg: /([\n]<table[\s\S]*?<\/table>)/gi, maxLen: chunkSize }, // HTML Table 尽可能保障完整
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

    const { reg, maxLen } = stepReges[step];

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
          return `$1${splitMarker}`;
        })()
      );
    })();

    const splitTexts = replaceText.split(splitMarker).filter((part) => part.trim());

    const result = splitTexts
      .map((text) => {
        const matchTitle = isMarkdownSplit ? text.match(reg)?.[0] || '' : '';
        // 如果一个分块没有匹配到，则使用默认块大小，否则使用最大块大小
        const chunkMaxSize = text.match(reg) === null ? chunkSize : maxLen;

        return {
          text: isMarkdownSplit ? text.replace(matchTitle, '') : text,
          title: matchTitle,
          chunkMaxSize
        };
      })
      .filter((item) => !!item.title || !!item.text?.trim());
    
    return result;
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
      const newTextLen = getTextValidLength(newText);

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
    const textLength = getTextValidLength(text);

    // Over step
    if (step >= stepReges.length) {
      if (textLength < maxSize) {
        return [text];
      }
      // use slice-chunkSize to split text
      const chunks: string[] = [];
      for (let i = 0; i < textLength; i += chunkSize - overlapLen) {
        chunks.push(text.slice(i, i + chunkSize));
      }
      return chunks;
    }

    // split text by special char
    const splitTexts = getSplitTexts({ text, step });

    const chunks: string[] = [];

    for (let i = 0; i < splitTexts.length; i++) {
      const item = splitTexts[i];

      const maxLen = item.chunkMaxSize; // 当前块最大长度

      const lastTextLen = getTextValidLength(lastText);
      const currentText = item.text;
      const newText = lastText + currentText;
      const newTextLen = getTextValidLength(newText);

      // split the current table if it will exceed after adding
      const tableHandlers = [
        { check: strIsHtmlTable, split: htmlTableSplit },
        { check: strIsMdTable, split: markdownTableSplit }
      ];

      const matchedHandler = tableHandlers.find((handler) =>
        handler.check(currentText) && newTextLen > maxLen
      );

      if (matchedHandler) {
        // 与原始版本逻辑一致：先推出 lastText，再处理表格
        if (lastTextLen > 0) {
          chunks.push(lastText);
          lastText = '';
        }

        // 构建完整的 headerPrefix
        // 如果在 Markdown 步骤中，需要包含当前的 item.title（因为它还没有被添加到 parentTitle）
        let headerPrefix = parentTitle;
        if (isMarkdownStep && item.title) {
          headerPrefix = parentTitle + item.title;
        }
        
        const { chunks: tableChunks } = matchedHandler.split({
          text: currentText,
          chunkSize: chunkSize * 1.2,
          headerPrefix: headerPrefix
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
            (chunk) => {
              // 如果 chunk 已经包含 parentTitle（来自表格分块），则不重复添加
              const fullTitle = parentTitle + item.title;
              if (step === markdownIndex + customRegLen) {
                return chunk.startsWith(fullTitle) ? chunk : `${fullTitle}${chunk}`;
              }
              return chunk;
            }
          )
        );

        continue;
      }

      // newText is too large(now, The lastText must be smaller than chunkSize)
      if (newTextLen > maxLen) {
        const minChunkLen = maxLen * 0.8; // 当前块最小长度
        const maxChunkLen = maxLen * 1.2; // 当前块最大长度

        // 新文本没有非常大，直接认为它是一个新的块
        if (newTextLen < maxChunkLen) {
          chunks.push(newText);
          lastText = getOneTextOverlapText({ text: newText, step }); // next chunk will start with overlayText
          continue;
        }
        // 上一个文本块已经挺大的，单独做一个块
        if (lastTextLen > minChunkLen) {
          chunks.push(lastText);

          lastText = getOneTextOverlapText({ text: lastText, step }); // next chunk will start with overlayText

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
        if (getTextValidLength(lastChunk) < minChunkLen) {
          chunks.push(...innerChunks.slice(0, -1));
          lastText = lastChunk;
          continue;
        }

        // Last chunk is large enough
        chunks.push(...innerChunks);
        // compute new overlapText
        lastText = getOneTextOverlapText({
          text: lastChunk,
          step
        });
        continue;
      }

      // New text is small

      // Not overlap
      if (forbidConcat) {
        chunks.push(currentText);
        continue;
      }

      lastText = newText;
    }

    /* If the last chunk is independent, it needs to be push chunks. */
    if (lastText && chunks[chunks.length - 1] && !chunks[chunks.length - 1].endsWith(lastText)) {
      if (getTextValidLength(lastText) < chunkSize * 0.4) {
        chunks[chunks.length - 1] = chunks[chunks.length - 1] + lastText;
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
  let { text = '', chunkSize } = props;
  const splitWithCustomSign = text.split(CUSTOM_SPLIT_SIGN);

  const splitResult = splitWithCustomSign.map((item) => {
    if (strIsHtmlTable(item)) {
      return htmlTableSplit({ ...props, text: item });
    }
    if (strIsMdTable(item)) {
      return markdownTableSplit({ ...props, text: item });
    }

    return commonSplit({ ...props, text: item });
  });

  let chunks = splitResult
    .map((item) => item.chunks)
    .flat()
    .map((chunk) => simpleText(chunk));

  // 特判：第一个分块如果小于400，直接合并到第二个分块
  if (chunks.length >= 2 && getTextValidLength(chunks[0]) < 400) {
    chunks[1] = chunks[0] + '\n' + chunks[1];
    chunks = chunks.slice(1);
  }

  // 辅助函数：提取文本开头的连续 Markdown 标题（返回数组）
  const extractLeadingHeadersArray = (text: string): string[] => {
    const lines = text.split('\n');
    const headers: string[] = [];
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line.trim())) {
        headers.push(line);
      } else if (line.trim()) {
        // 遇到非标题的非空行就停止
        break;
      }
    }
    return headers;
  };

  // 辅助函数：找出两个标题数组的共同前缀长度
  const getCommonHeaderPrefixLength = (headers1: string[], headers2: string[]): number => {
    let count = 0;
    const minLen = Math.min(headers1.length, headers2.length);
    for (let i = 0; i < minLen; i++) {
      if (headers1[i].trim() === headers2[i].trim()) {
        count++;
      } else {
        break;
      }
    }
    return count;
  };

  // 辅助函数：移除文本开头指定数量的 Markdown 标题
  const removeLeadingHeadersCount = (text: string, count: number): string => {
    if (count === 0) return text;
    const lines = text.split('\n');
    let removed = 0;
    let startIndex = 0;
    for (let i = 0; i < lines.length && removed < count; i++) {
      if (/^#{1,6}\s/.test(lines[i].trim())) {
        removed++;
        startIndex = i + 1;
      } else if (lines[i].trim()) {
        // 遇到非标题的非空行就停止
        break;
      }
    }
    return lines.slice(startIndex).join('\n');
  };

  // 第一步：对小于400的连续小块进行两两合并（多轮迭代直到无法继续合并）
  const smallChunkThreshold = 400;
  let preProcessedChunks = [...chunks];
  let hasSmallChunks = true;

  while (hasSmallChunks) {
    const tempChunks: string[] = [];
    let i = 0;
    hasSmallChunks = false;

    while (i < preProcessedChunks.length) {
      const currentChunk = preProcessedChunks[i];
      const currentLength = getTextValidLength(currentChunk);

      // 如果当前块小于阈值且还有下一个块
      if (currentLength < smallChunkThreshold && i + 1 < preProcessedChunks.length) {
        const nextChunk = preProcessedChunks[i + 1];
        const nextLength = getTextValidLength(nextChunk);

        // 如果下一个块也小于阈值，则合并
        if (nextLength < smallChunkThreshold) {
          // 检测并去除重复的父标题
          const currentHeaders = extractLeadingHeadersArray(currentChunk);
          const nextHeaders = extractLeadingHeadersArray(nextChunk);
          const commonPrefixLength = getCommonHeaderPrefixLength(currentHeaders, nextHeaders);
          
          const nextChunkToAdd = commonPrefixLength > 0 
            ? removeLeadingHeadersCount(nextChunk, commonPrefixLength)
            : nextChunk;

          const mergedChunk = currentChunk + '\n\n' + nextChunkToAdd;
          tempChunks.push(mergedChunk);
          i += 2; // 跳过下一个块
          hasSmallChunks = true; // 标记还有小块，可能需要继续合并
          continue;
        }
      }

      // 无法合并，直接添加当前块
      tempChunks.push(currentChunk);
      i++;
    }

    preProcessedChunks = tempChunks;
  }

  // 第二步：装箱式合并 - 避免小块单独成块
  const maxBoxSize = chunkSize * 1.2;
  const mergedChunks: string[] = [];
  let currentBox = '';

  for (let i = 0; i < preProcessedChunks.length; i++) {
    const chunk = preProcessedChunks[i];
    const chunkLength = getTextValidLength(chunk);
    
    // 检测并去除重复的父标题
    let chunkToAdd = chunk;
    if (currentBox) {
      const currentBoxHeaders = extractLeadingHeadersArray(currentBox);
      const chunkHeaders = extractLeadingHeadersArray(chunk);
      
      // 找出共同的父标题前缀长度
      const commonPrefixLength = getCommonHeaderPrefixLength(currentBoxHeaders, chunkHeaders);
      
      // 如果有共同的父标题，去除 chunk 中的重复父标题
      if (commonPrefixLength > 0) {
        chunkToAdd = removeLeadingHeadersCount(chunk, commonPrefixLength);
      }
    }
    
    const testBox = currentBox ? currentBox + '\n\n' + chunkToAdd : chunk;
    const testBoxLength = getTextValidLength(testBox);

    // 如果装入当前chunk后不超过盒子最大容量，则装入
    if (testBoxLength <= maxBoxSize) {
      currentBox = testBox;
    } else {
      // 装不下了，需要判断当前盒子是否太小
      const currentBoxLength = getTextValidLength(currentBox);
      
      // 如果当前盒子小于400，强制装入当前chunk（即使超过maxBoxSize）
      if (currentBoxLength < smallChunkThreshold && currentBox) {
        currentBox = testBox;
      } else {
        // 当前盒子足够大，可以独立成块
        if (currentBox) {
          mergedChunks.push(currentBox);
        }
        
        // 开始新盒子，装入当前chunk（使用原始chunk，保留标题）
        currentBox = chunk;
        
        // 检查当前chunk是否太小，如果是最后一个chunk则无所谓，否则强制与下一个合并
        if (chunkLength < smallChunkThreshold && i < preProcessedChunks.length - 1) {
          // 当前chunk太小，尝试与下一个chunk合并
          const nextChunk = preProcessedChunks[i + 1];
          const nextHeaders = extractLeadingHeadersArray(nextChunk);
          const currentHeaders = extractLeadingHeadersArray(chunk);
          const nextCommonPrefixLength = getCommonHeaderPrefixLength(currentHeaders, nextHeaders);
          
          const nextChunkToAdd = nextCommonPrefixLength > 0
            ? removeLeadingHeadersCount(nextChunk, nextCommonPrefixLength)
            : nextChunk;
          
          currentBox = chunk + '\n\n' + nextChunkToAdd;
          i++; // 跳过下一个chunk
        }
      }
    }
  }

  // 最后一个盒子
  if (currentBox) {
    mergedChunks.push(currentBox);
  }

  return {
    chunks: mergedChunks,
    chars: mergedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  };
};
