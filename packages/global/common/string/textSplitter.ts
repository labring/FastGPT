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

  const lines = str.split('\n').filter((line) => line.trim());

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

// 新增：判断是否为制表符表格
const strIsTabTable = (str: string): boolean => {
  const lines = str.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return false;

  const tabLines = lines.filter((line) => {
    const tabs = line.split('\t');
    return tabs.length >= 3; // 至少3列才算表格
  });

  // 降低阈值到70%，以适应混合内容
  return tabLines.length / lines.length >= 0.7 && tabLines.length >= 2;
};

// 新增：将制表符表格转换为Markdown表格
const convertTabTableToMarkdown = (text: string): string => {
  const lines = text.split('\n').filter((line) => line.trim());
  const tabLines = lines.filter((line) => line.split('\t').length >= 3);

  if (tabLines.length === 0) return text;

  // 找到最大列数
  let maxColumns = 0;
  tabLines.forEach((line) => {
    const columns = line.split('\t');
    if (columns.length > maxColumns) {
      maxColumns = columns.length;
    }
  });

  // 生成表头
  const headerCells = Array(maxColumns)
    .fill(0)
    .map((_, i) => `列${i + 1}`);
  const header = `| ${headerCells.join(' | ')} |`;
  const separator = `| ${Array(maxColumns).fill('---').join(' | ')} |`;

  // 转换数据行
  const markdownRows = [header, separator];

  tabLines.forEach((line) => {
    const cells = line.split('\t');
    // 补齐列数
    while (cells.length < maxColumns) {
      cells.push('');
    }
    // 截取到最大列数
    const row = `| ${cells.slice(0, maxColumns).join(' | ')} |`;
    markdownRows.push(row);
  });

  return markdownRows.join('\n');
};

// 新增：检测不完整的表格（可能是跨页表格的一部分）
const isIncompleteTable = (str: string): boolean => {
  const lines = str.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return false;

  // 检查是否大部分行都是表格格式（管道符或制表符）
  const tableLines = lines.filter((line) => {
    const trimmed = line.trim();
    // 管道符表格
    const isPipeTable =
      trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length > 2;
    // 制表符表格
    const isTabTable = trimmed.split('\t').length >= 3;
    return isPipeTable || isTabTable;
  });

  // 如果70%以上的行都是表格格式，认为是不完整表格
  return tableLines.length / lines.length >= 0.7 && tableLines.length >= 2;
};

// 新增：尝试修复不完整的表格
const repairIncompleteTable = (text: string): string => {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return text;

  // 找到第一行作为潜在的表头
  const firstTableLine = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith('|') && trimmed.endsWith('|');
  });

  if (!firstTableLine) return text;

  // 计算列数
  const columnCount = firstTableLine.split('|').length - 2;
  if (columnCount <= 0) return text;

  // 创建表头（如果没有的话）
  const hasValidHeader =
    lines.length >= 2 &&
    lines[0].trim().startsWith('|') &&
    lines[1].trim().match(/^(\|[\s:]*-+[\s:]*)+\|$/);

  if (!hasValidHeader) {
    // 生成默认表头
    const headerCells = Array(columnCount)
      .fill(0)
      .map((_, i) => `列${i + 1}`);
    const header = `| ${headerCells.join(' | ')} |`;
    const separator = `| ${Array(columnCount).fill('---').join(' | ')} |`;

    // 找到所有表格行
    const tableRows = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('|') && trimmed.endsWith('|');
    });

    return [header, separator, ...tableRows].join('\n');
  }

  return text;
};

// 新增：合并连续的表格片段
const mergeTableFragments = (text: string): string => {
  const paragraphs = text.split(/\n\s*\n/);
  const mergedParagraphs: string[] = [];
  let currentTableBuffer: string[] = [];

  for (const paragraph of paragraphs) {
    if (strIsMdTable(paragraph)) {
      // 完整的管道符表格，直接处理
      if (currentTableBuffer.length > 0) {
        // 合并之前的片段
        const mergedTable = mergeTableBufferToComplete(currentTableBuffer);
        mergedParagraphs.push(mergedTable);
        currentTableBuffer = [];
      }
      mergedParagraphs.push(paragraph);
    } else if (strIsTabTable(paragraph)) {
      // 制表符表格，转换为Markdown表格
      if (currentTableBuffer.length > 0) {
        // 合并之前的片段
        const mergedTable = mergeTableBufferToComplete(currentTableBuffer);
        mergedParagraphs.push(mergedTable);
        currentTableBuffer = [];
      }
      const markdownTable = convertTabTableToMarkdown(paragraph);
      mergedParagraphs.push(markdownTable);
    } else if (isIncompleteTable(paragraph)) {
      // 不完整表格，加入缓冲区
      currentTableBuffer.push(paragraph);
    } else {
      // 非表格内容
      if (currentTableBuffer.length > 0) {
        // 处理缓冲区中的表格片段
        const mergedTable = mergeTableBufferToComplete(currentTableBuffer);
        mergedParagraphs.push(mergedTable);
        currentTableBuffer = [];
      }
      mergedParagraphs.push(paragraph);
    }
  }

  // 处理剩余的表格片段
  if (currentTableBuffer.length > 0) {
    const mergedTable = mergeTableBufferToComplete(currentTableBuffer);
    mergedParagraphs.push(mergedTable);
  }

  return mergedParagraphs.join('\n\n');
};

// 新增：将表格片段合并为完整表格
const mergeTableBufferToComplete = (fragments: string[]): string => {
  if (fragments.length === 0) return '';
  if (fragments.length === 1) return repairIncompleteTable(fragments[0]);

  // 合并所有表格行
  const allLines: string[] = [];
  let columnCount = 0;

  // 先确定列数
  for (const fragment of fragments) {
    const lines = fragment.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cols = trimmed.split('|').length - 2;
        if (cols > columnCount) {
          columnCount = cols;
        }
      }
    }
  }

  // 生成表头
  const headerCells = Array(columnCount)
    .fill(0)
    .map((_, i) => `列${i + 1}`);
  const header = `| ${headerCells.join(' | ')} |`;
  const separator = `| ${Array(columnCount).fill('---').join(' | ')} |`;

  allLines.push(header, separator);

  // 合并所有数据行
  for (const fragment of fragments) {
    const lines = fragment.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // 标准化列数
        const cells = trimmed.split('|').slice(1, -1);
        while (cells.length < columnCount) {
          cells.push('');
        }
        const normalizedRow = `| ${cells.slice(0, columnCount).join(' | ')} |`;
        allLines.push(normalizedRow);
      }
    }
  }

  return allLines.join('\n');
};

const markdownTableSplit = (props: SplitProps): SplitResponse => {
  let { text = '', chunkSize, maxSize = defaultMaxChunkSize } = props;
  const splitText2Lines = text.split('\n');
  const header = splitText2Lines[0];
  const headerSize = header.split('|').length - 2;

  const mdSplitString = `| ${new Array(headerSize > 0 ? headerSize : 1)
    .fill(0)
    .map(() => '---')
    .join(' | ')} |`;

  const chunks: string[] = [];
  let chunk = `${header}
${mdSplitString}
`;

  for (let i = 2; i < splitText2Lines.length; i++) {
    const chunkLength = getTextValidLength(chunk);
    const nextLineLength = getTextValidLength(splitText2Lines[i]);

    // 使用maxSize而不是chunkSize，给表格更大空间
    const tableChunkSize = Math.max(chunkSize, maxSize * 0.8);

    // Over size
    if (chunkLength + nextLineLength > tableChunkSize) {
      chunks.push(chunk);
      chunk = `${header}
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

  // 2. 表格跨页合并处理 - 新增
  text = mergeTableFragments(text);

  // 3. Markdown 表格处理 - 单独提取表格出来，进行表头合并
  const tableReg =
    /(\n\|(?:(?:[^\n|]+\|){1,})\n\|(?:[:\-\s]+\|){1,}\n(?:\|(?:[^\n|]+\|)*\n?)*)(?:\n|$)/g;
  const tableDataList = text.match(tableReg);
  if (tableDataList) {
    tableDataList.forEach((tableData) => {
      const { chunks } = markdownTableSplit({
        text: tableData.trim(),
        chunkSize
      });

      const splitText = chunks.join('\n');
      text = text.replace(tableData, `\n${splitText}\n`);
    });
  }

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

  const stepReges: { reg: RegExp | string; maxLen: number }[] = [
    ...customReg.map((text) => ({
      reg: text.replaceAll('\\n', '\n'),
      maxLen: chunkSize
    })),
    ...markdownHeaderRules,

    { reg: /([\n](```[\s\S]*?```|~~~[\s\S]*?~~~))/g, maxLen: maxSize }, // code block
    // HTML Table tag 尽可能保障完整
    {
      reg: /(\n\|(?:(?:[^\n|]+\|){1,})\n\|(?:[:\-\s]+\|){1,}\n(?:\|(?:[^\n|]+\|)*\n)*)/g,
      maxLen: maxSize // 增加表格的最大长度限制
    }, // Markdown Table 尽可能保证完整性
    // 制表符表格也要保持完整性
    {
      reg: /(\n(?:[^\n]*\t[^\n]*){2,})/g,
      maxLen: maxSize // 制表符表格使用最大长度限制
    },
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

    return splitTexts
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
  let { text = '' } = props;
  const splitWithCustomSign = text.split(CUSTOM_SPLIT_SIGN);

  const splitResult = splitWithCustomSign.map((item) => {
    if (strIsMdTable(item)) {
      return markdownTableSplit(props);
    }

    // 新增：处理制表符表格
    if (strIsTabTable(item)) {
      const convertedText = convertTabTableToMarkdown(item);
      return markdownTableSplit({ ...props, text: convertedText });
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
