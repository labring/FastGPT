import { defaultMaxChunkSize } from '../../core/dataset/training/utils';
import { getErrText } from '../error/utils';
import { simpleText } from './tools';
import { getTextValidLength } from './utils';

export const CUSTOM_SPLIT_SIGN = '-----CUSTOM_SPLIT_SIGN-----';

// 常量定义
const OVERLAP_RATIO = 0.15;
const MAX_OVERLAP_RATIO = 0.4;
const CHUNK_SIZE_MULTIPLIER = 1.2;
const MIN_CHUNK_SIZE_RATIO = 0.8;
const SMALL_CHUNK_THRESHOLD = 400;
const SMALL_CHUNK_MERGE_THRESHOLD = 0.4;

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

// ============ 去重处理辅助函数 ============

// 去重阈值常量
const DEDUP_TABLE_CELL_THRESHOLD = 5; // 表格单元格重复阈值
const DEDUP_WORD_THRESHOLD = 10; // 单词重复阈值
const DEDUP_MIN_WORDS = 20; // 触发单词去重的最小单词数
const DEDUP_LONG_LINE_THRESHOLD = 1000; // 超长行阈值
const DEDUP_CONSECUTIVE_WORD_THRESHOLD = 3; // 连续重复单词压缩阈值

/**
 * 通用去重函数：统计并压缩重复项
 * @param items 待处理的项目数组
 * @param threshold 重复次数阈值，超过此值才压缩
 * @param separator 连接符
 * @param preserveOrder 是否保留原始顺序
 */
const deduplicateItems = (
  items: string[],
  threshold: number,
  separator: string = ' ',
  preserveOrder: boolean = false
): string => {
  if (items.length === 0) return '';

  // 统计每个项目出现的次数
  const itemCounts = new Map<string, number>();
  items.forEach(item => {
    itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
  });

  if (preserveOrder) {
    // 保留顺序：按原始顺序输出，但每个项目只输出一次或压缩
    const result: string[] = [];
    const seen = new Set<string>();

    items.forEach(item => {
      if (!seen.has(item)) {
        const count = itemCounts.get(item)!;
        if (count > threshold) {
          result.push(`${item}(×${count})`);
        } else {
          // 保留原有的重复次数
          for (let i = 0; i < count; i++) {
            result.push(item);
          }
        }
        seen.add(item);
      }
    });

    return result.join(separator);
  } else {
    // 不保留顺序：直接按统计结果输出
    return Array.from(itemCounts.entries())
      .map(([item, count]) => {
        if (count > threshold) {
          return `${item}(×${count})`;
        }
        return Array(count).fill(item).join(separator);
      })
      .join(separator);
  }
};

/**
 * 检测并压缩连续重复的单词
 * 例如: "hello hello hello world" -> "hello(×3) world"
 */
const deduplicateConsecutiveWords = (line: string): string => {
  // 使用正则检测连续重复的单词
  return line.replace(/(\S+)(\s+\1)+/g, (match, word) => {
    // 更准确地计算单词重复次数：匹配所有非空白字符序列
    const count = (match.match(/\S+/g) || []).length;
    return count > DEDUP_CONSECUTIVE_WORD_THRESHOLD ? `${word}(×${count})` : match;
  });
};

/**
 * 去除一行中的重复内容
 */
const deduplicateLine = (line: string): string => {
  if (!line || line.length === 0) return line;

  // 检测是否是表格行（包含 |）
  if (line.includes('|')) {
    const cells = line.split('|').map(c => c.trim()).filter(c => c);

    if (cells.length === 0) return line;

    // 使用通用去重函数，保留顺序
    return deduplicateItems(cells, DEDUP_TABLE_CELL_THRESHOLD, ' | ', true);
  }

  // 检测重复单词（只处理较长的行）
  const words = line.split(/\s+/).filter(w => w.length > 0);

  if (words.length > DEDUP_MIN_WORDS) {
    // 先尝试检测连续重复
    const consecutiveDeduped = deduplicateConsecutiveWords(line);

    // 如果连续去重后长度显著减少，说明有效果，直接返回
    if (consecutiveDeduped.length < line.length * 0.8) {
      return consecutiveDeduped;
    }

    // 否则检查是否有大量非连续重复
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // 检查是否存在高频重复词
    const hasHighFreqWord = Array.from(wordCounts.values()).some(count => count > DEDUP_WORD_THRESHOLD);

    if (hasHighFreqWord) {
      // 使用通用去重函数，保留顺序
      return deduplicateItems(words, DEDUP_WORD_THRESHOLD, ' ', true);
    }
  }

  return line;
};

/**
 * 去除分片中的重复内容
 * 针对代码块和表格中的重复模式进行压缩
 */
const deduplicateChunk = (chunk: string): string => {
  const lines = chunk.split('\n');
  const dedupedLines: string[] = [];

  let inCodeBlock = false;
  let codeBlockDelimiter = ''; // 记录开始的分隔符，确保匹配

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // 检测代码块的开始和结束
    const codeBlockMatch = trimmedLine.match(/^(```|~~~)(\w*)$/);

    if (codeBlockMatch) {
      const delimiter = codeBlockMatch[1];
      const language = codeBlockMatch[2] || '';

      if (!inCodeBlock) {
        // 进入代码块
        inCodeBlock = true;
        codeBlockDelimiter = delimiter;
        dedupedLines.push(line);
      } else if (delimiter === codeBlockDelimiter && !language) {
        // 退出代码块（分隔符必须匹配，且结束标记不应有语言标识）
        inCodeBlock = false;
        codeBlockDelimiter = '';
        dedupedLines.push(line);
      } else {
        // 代码块内的内容（可能是代码中的字符串）
        dedupedLines.push(line);
      }
      continue;
    }

    // 在代码块内，检测并去重超长行
    if (inCodeBlock) {
      if (line.length > DEDUP_LONG_LINE_THRESHOLD) {
        const dedupedLine = deduplicateLine(line);
        dedupedLines.push(dedupedLine);
      } else {
        dedupedLines.push(line);
      }
    } else {
      // 代码块外的内容保持不变
      dedupedLines.push(line);
    }
  }

  // 如果代码块没有正确关闭，记录警告（生产环境可以用日志）
  if (inCodeBlock) {
    // console.warn('Unclosed code block detected in chunk');
    // 尝试自动关闭
    dedupedLines.push(codeBlockDelimiter);
  }

  return dedupedLines.join('\n');
};

// ============ Markdown 标题处理辅助函数 ============

/**
 * 提取文本开头的连续 Markdown 标题
 */
const extractLeadingHeaders = (text: string): string[] => {
  const lines = text.split('\n');
  const headers: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      headers.push(trimmed);
    } else if (trimmed) {
      break; // 遇到非标题的非空行就停止
    }
  }
  return headers;
};

/**
 * 提取文本中所有的 Markdown 标题
 */
const extractAllHeaders = (text: string): string[] => {
  const lines = text.split('\n');
  return lines
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s/.test(line));
};

/**
 * 检查两个标题数组的共同前缀长度
 */
const getCommonHeaderPrefixLength = (headers1: string[], headers2: string[]): number => {
  const minLen = Math.min(headers1.length, headers2.length);
  let count = 0;
  for (let i = 0; i < minLen; i++) {
    if (headers1[i] === headers2[i]) {
      count++;
    } else {
      break;
    }
  }
  return count;
};

/**
 * 检查 chunk 开头的标题有多少个已经在 currentBox 的所有标题中按顺序出现
 */
const countMatchingPrefixHeaders = (
  currentBoxAllHeaders: string[],
  chunkLeadingHeaders: string[]
): number => {
  if (chunkLeadingHeaders.length === 0) return 0;

  let matchCount = 0;
  let searchStartIndex = 0;

  for (const targetHeader of chunkLeadingHeaders) {
    let found = false;
    for (let j = searchStartIndex; j < currentBoxAllHeaders.length; j++) {
      if (currentBoxAllHeaders[j] === targetHeader) {
        matchCount++;
        searchStartIndex = j + 1;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return matchCount;
};

/**
 * 移除文本开头指定数量的 Markdown 标题
 */
const removeLeadingHeaders = (text: string, count: number): string => {
  if (count === 0) return text;

  const lines = text.split('\n');
  let removed = 0;
  let startIndex = 0;

  for (let i = 0; i < lines.length && removed < count; i++) {
    const trimmed = lines[i].trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      removed++;
      startIndex = i + 1;
    } else if (trimmed) {
      break; // 遇到非标题的非空行就停止
    }
  }

  return lines.slice(startIndex).join('\n');
};

/**
 * 智能合并两个块：去除第二个块中与第一个块重复的父标题
 * @param chunk1 第一个块
 * @param chunk2 第二个块
 * @param separator 分隔符（默认 '\n\n'）
 * @returns 合并后的文本
 */
const mergeChunksWithDedup = (
  chunk1: string,
  chunk2: string,
  separator: string = '\n\n'
): string => {
  const headers1 = extractLeadingHeaders(chunk1);
  const headers2 = extractLeadingHeaders(chunk2);
  const commonPrefixLength = getCommonHeaderPrefixLength(headers1, headers2);

  // 如果有公共标题前缀，去除第二个块中重复的父标题
  // 注意：即使标题完全相同（commonPrefixLength === headers2.length），也应该去重
  const chunk2ToAdd =
    commonPrefixLength > 0
      ? removeLeadingHeaders(chunk2, commonPrefixLength)
      : chunk2;

  return chunk1 + separator + chunk2ToAdd;
};

// ============ 表格处理函数 ============

/**
 * 构建HTML表格块
 */
const buildHtmlTableChunk = (
  headerPrefix: string,
  tableOpenTag: string,
  tableCloseTag: string,
  theadContent: string | null,
  headerRow: string,
  bodyContent: string
): string => {
  let chunk = `${headerPrefix}${tableOpenTag}\n`;
  if (theadContent) {
    chunk += `${theadContent}\n<tbody>\n`;
  } else {
    chunk += `<tbody>\n${headerRow}\n`;
  }
  chunk += `${bodyContent}</tbody>\n${tableCloseTag}`;
  return chunk;
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
  let { text = '', chunkSize, maxSize = defaultMaxChunkSize, headerPrefix = '' } = props;

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
  const defaultChunk = `${headerPrefix}${header}
${mdSplitString}
`;
  let chunk = defaultChunk;

  for (let i = 2; i < splitText2Lines.length; i++) {
    const chunkLength = getTextValidLength(chunk);
    const nextLineLength = getTextValidLength(splitText2Lines[i]);

    // Over size
    if (chunkLength + nextLineLength > chunkSize) {
      // 单行非常的长，直接分割
      if (chunkLength > maxSize) {
        const newChunks = commonSplit({
          ...props,
          text: chunk.replace(defaultChunk, '').trim()
        }).chunks;
        chunks.push(...newChunks);
      } else {
        chunks.push(chunk);
      }

      chunk = defaultChunk;
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

// 判断字符串是否为代码块
const strIsCodeBlock = (str: string) => {
  const trimmedStr = str.trim();

  // 检查是否以 ``` 或 ~~~ 开头和结尾
  const codeBlockPattern = /^(```|~~~)[\s\S]*?\1$/;
  return codeBlockPattern.test(trimmedStr);
};

// 代码块切分函数
const codeBlockSplit = (props: SplitProps & { headerPrefix?: string }): SplitResponse => {
  let { text = '', chunkSize, headerPrefix = '' } = props;

  // 将 finalChunks 提升到函数作用域，以便在 catch 块中访问
  let finalChunks: string[] = [];

  try {
    // 提取代码块的开始和结束标记
    const startMatch = text.match(/^(```|~~~)(\w*)\n/);
    if (!startMatch) {
      return { chunks: [text], chars: text.length };
    }

    const delimiter = startMatch[1]; // ``` 或 ~~~
    const language = startMatch[2] || ''; // 语言标识
    const startTag = `${delimiter}${language}\n`;
    const endTag = `\n${delimiter}`;

    // 提取代码内容
    const codeContent = text
      .replace(new RegExp(`^${delimiter}\\w*\\n`), '')
      .replace(new RegExp(`\\n${delimiter}$`), '');

    // 按行切分代码
    const lines = codeContent.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      const testChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      const testChunkWithTags = `${headerPrefix}${startTag}${testChunk}${endTag}`;
      const testChunkTokens = getTextValidLength(testChunkWithTags);

      if (testChunkTokens > chunkSize && currentChunk) {
        // 当前块已满，保存并开始新块
        chunks.push(`${headerPrefix}${startTag}${currentChunk}${endTag}`);
        currentChunk = line;
      } else {
        currentChunk = testChunk;
      }
    }

    // 添加最后一个块
    if (currentChunk) {
      chunks.push(`${headerPrefix}${startTag}${currentChunk}${endTag}`);
    }

    // ========== 检查并切分超长的单行代码块 ==========
    for (const chunk of chunks) {
      const chunkTokens = getTextValidLength(chunk);

      // 如果单个 chunk 超过 chunkSize，说明是单行超长，需要在行内切分
      if (chunkTokens > chunkSize) {
        // 提取代码内容（去除开始和结束标记）
        const chunkContent = chunk
          .replace(new RegExp(`^${headerPrefix}${delimiter}\\w*\\n`), '')
          .replace(new RegExp(`\\n${delimiter}$`), '');

        // 使用字符切分
        const contentTokens = getTextValidLength(chunkContent);
        // 防止除零：如果内容仅含空白字符，contentTokens 可能为 0
        const avgCharsPerToken = contentTokens > 0 ? chunkContent.length / contentTokens : chunkContent.length;
        const charsPerChunk = Math.max(1, Math.floor(chunkSize * avgCharsPerToken));

        for (let pos = 0; pos < chunkContent.length; pos += charsPerChunk) {
          const subContent = chunkContent.slice(pos, pos + charsPerChunk);
          // 只过滤完全空的内容，保留有空白字符的内容（可能是有意义的格式）
          if (subContent.length > 0) {
            finalChunks.push(`${headerPrefix}${startTag}${subContent}${endTag}`);
          }
        }
      } else {
        finalChunks.push(chunk);
      }
    }

    return {
      chunks: finalChunks,
      chars: finalChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    };
  } catch (error) {
    // 如果解析失败，尝试返回已处理的部分或原文本
    if (finalChunks.length > 0) {
      // 有部分处理成功的数据，返回这些数据而不是完全丢弃
      return {
        chunks: finalChunks,
        chars: finalChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      };
    } else {
      // 完全失败，返回原文本作为降级处理
      return { chunks: [text], chars: text.length };
    }
  }
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

  // 将 finalChunks 提升到函数作用域，以便在 catch 块中访问
  let finalChunks: string[] = [];

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

    // 如果有 thead，使用 thead；否则使用第一个 tr
    let currentBodyContent = theadContent ? '' : `${headerRow}\n`;

    // 从第二个 tr 开始遍历（如果有 thead 则从第一个开始）
    const startIndex = theadContent ? 0 : 1;

    for (let i = startIndex; i < trMatches.length; i++) {
      const currentRow = trMatches[i];
      const currentChunk = buildHtmlTableChunk(
        headerPrefix,
        tableOpenTag,
        tableCloseTag,
        theadContent,
        headerRow,
        currentBodyContent
      );
      const chunkLength = getTextValidLength(currentChunk);
      const rowLength = getTextValidLength(currentRow);

      // 超过大小限制，创建新块
      if (chunkLength + rowLength > chunkSize && i > startIndex) {
        chunks.push(currentChunk);

        // 开始新块，重置body内容
        currentBodyContent = '';
      }

      currentBodyContent += `${currentRow}\n`;
    }

    // 添加最后一个块
    if (currentBodyContent) {
      chunks.push(
        buildHtmlTableChunk(headerPrefix, tableOpenTag, tableCloseTag, theadContent, headerRow, currentBodyContent)
      );
    }

    // ========== 检查并切分超大的 chunk ==========
    // finalChunks 已在函数作用域声明，直接使用

    for (const tableChunk of chunks) {
      const chunkTokens = getTextValidLength(tableChunk);

      // 如果 chunk 超过 chunkSize，需要在单元格内部切分
      if (chunkTokens > chunkSize) {
        // 提取表格中的所有行
        const chunkTrMatches = tableChunk.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
        if (!chunkTrMatches || chunkTrMatches.length === 0) {
          finalChunks.push(tableChunk);
          continue;
        }

        // 找到表头行（第一个 tr 或 thead 中的 tr）
        const chunkTheadMatch = tableChunk.match(/<thead[^>]*>[\s\S]*?<\/thead>/);
        const chunkTheadContent = chunkTheadMatch ? chunkTheadMatch[0] : null;
        const chunkHeaderRow = chunkTheadMatch
          ? chunkTheadMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/)?.[0] || chunkTrMatches[0]
          : chunkTrMatches[0];

        // 遍历每一行，检查是否需要切分
        for (let j = (chunkTheadMatch ? 0 : 1); j < chunkTrMatches.length; j++) {
          const row = chunkTrMatches[j];
          const rowTokens = getTextValidLength(row);

          // 如果单行超过 chunkSize，需要在单元格内部切分
          if (rowTokens > chunkSize) {
            // 提取单元格内容
            const cellMatches = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g);
            if (!cellMatches || cellMatches.length === 0) {
              // 无法解析单元格，保持原样
              finalChunks.push(
                buildHtmlTableChunk(headerPrefix, tableOpenTag, tableCloseTag, chunkTheadContent, chunkHeaderRow, `${row}\n`)
              );
              continue;
            }

            // 对每个单元格的内容进行切分
            const cellContents: { tag: string; content: string }[] = [];
            for (const cell of cellMatches) {
              const tagMatch = cell.match(/<(t[dh])([^>]*)>/);
              const contentMatch = cell.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/);
              if (tagMatch && contentMatch) {
                const tagName = tagMatch[1];
                const tagAttrs = tagMatch[2];
                const content = contentMatch[1];
                cellContents.push({
                  tag: `<${tagName}${tagAttrs}>`,
                  content: content
                });
              }
            }

            // 对长文本单元格进行切分
            const splitCells: string[][] = [];
            for (const cell of cellContents) {
              const cellTokens = getTextValidLength(cell.content);

              if (cellTokens > chunkSize) {
                // 单元格内容过长，需要切分
                // 使用简单的字符切分（按 chunkSize 切分）
                const cellChunks: string[] = [];
                const contentLength = cell.content.length;
                // 防止除零：HTML 标签多但可见内容少时，cellTokens 可能为 0
                const avgCharsPerToken = cellTokens > 0 ? contentLength / cellTokens : contentLength;
                const charsPerChunk = Math.max(1, Math.floor(chunkSize * avgCharsPerToken));

                for (let pos = 0; pos < contentLength; pos += charsPerChunk) {
                  cellChunks.push(cell.content.slice(pos, pos + charsPerChunk));
                }
                splitCells.push(cellChunks);
              } else {
                // 单元格内容不长，保持原样
                splitCells.push([cell.content]);
              }
            }

            // 计算需要生成多少行（取最大的切分数量）
            const maxSplits = Math.max(...splitCells.map(c => c.length));

            // 生成多行，每行包含对应的单元格切片
            for (let splitIndex = 0; splitIndex < maxSplits; splitIndex++) {
              const rowCells = cellContents.map((cell, cellIndex) => {
                const cellSplits = splitCells[cellIndex];
                const content = splitIndex < cellSplits.length ? cellSplits[splitIndex] : '';
                const closeTag = cell.tag.replace('<', '</').replace(/\s.*?>/, '>');
                return `${cell.tag}${content}${closeTag}`;
              });

              const newRow = `<tr>\n${rowCells.join('\n')}\n</tr>`;

              // 创建新的表格块
              finalChunks.push(
                buildHtmlTableChunk(headerPrefix, tableOpenTag, tableCloseTag, chunkTheadContent, chunkHeaderRow, `${newRow}\n`)
              );
            }
          } else {
            // 单行不超过 chunkSize，保持原样
            finalChunks.push(
              buildHtmlTableChunk(headerPrefix, tableOpenTag, tableCloseTag, chunkTheadContent, chunkHeaderRow, `${row}\n`)
            );
          }
        }
      } else {
        // chunk 不超过 chunkSize，保持原样
        finalChunks.push(tableChunk);
      }
    }

    return {
      chunks: finalChunks,
      chars: finalChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    };
  } catch (error) {
    // 如果解析失败，尝试返回已处理的部分或原文本
    if (finalChunks.length > 0) {
      // 有部分处理成功的数据，返回这些数据而不是完全丢弃
      return {
        chunks: finalChunks,
        chars: finalChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      };
    } else {
      // 完全失败，返回原文本作为降级处理
      return { chunks: [text], chars: text.length };
    }
  }
};

// 文本分割策略配置
const SPLIT_STRATEGIES = [
  { check: strIsCodeBlock, split: codeBlockSplit },
  { check: strIsHtmlTable, split: htmlTableSplit },
  { check: strIsMdTable, split: markdownTableSplit }
];

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
    overlapRatio = OVERLAP_RATIO,
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
      maxLen: maxSize
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

    return result;
  };

  /* Gets the overlap at the end of a text as the beginning of the next block */
  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * MAX_OVERLAP_RATIO;

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

    // Over step
    if (step >= stepReges.length) {
      // Merge lastText with current text to prevent data loss
      const combinedText = lastText + text;
      const combinedLength = getTextValidLength(combinedText);

      if (combinedLength < maxSize) {
        return [combinedText];
      }
      // use slice-chunkSize to split text
      // Note: Use combinedText.length for slicing, not combinedLength
      const chunks: string[] = [];
      for (let i = 0; i < combinedText.length; i += chunkSize - overlapLen) {
        chunks.push(combinedText.slice(i, i + chunkSize));
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

      // split the current table or code block if it will exceed after adding
      const matchedHandler = SPLIT_STRATEGIES.find(
        (handler) => handler.check(currentText) && newTextLen > maxLen
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
          chunkSize: chunkSize * CHUNK_SIZE_MULTIPLIER,
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
          ...innerChunks.map((chunk) => {
            // 如果 chunk 已经包含 parentTitle（来自表格分块），则不重复添加
            const fullTitle = parentTitle + item.title;
            if (step === markdownIndex + customRegLen) {
              return chunk.startsWith(fullTitle) ? chunk : `${fullTitle}${chunk}`;
            }
            return chunk;
          })
        );

        continue;
      }

      // newText is too large(now, The lastText must be smaller than chunkSize)
      if (newTextLen > maxLen) {
        const minChunkLen = maxLen * MIN_CHUNK_SIZE_RATIO; // 当前块最小长度
        const maxChunkLen = maxLen * CHUNK_SIZE_MULTIPLIER; // 当前块最大长度

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
      if (getTextValidLength(lastText) < chunkSize * SMALL_CHUNK_MERGE_THRESHOLD) {
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
    // 使用策略模式查找匹配的分割器
    const strategy = SPLIT_STRATEGIES.find(s => s.check(item));
    if (strategy) {
      return strategy.split({ ...props, text: item });
    }
    return commonSplit({ ...props, text: item });
  });

  let chunks = splitResult
    .map((item) => item.chunks)
    .flat()
    .map((chunk) => simpleText(chunk));

  //=== 后处理：去重、合并小块、去重标题 ===
  // 应用去重逻辑，减少由重复内容导致的超大分片
  chunks = chunks.map((chunk) => deduplicateChunk(chunk));

  const smallChunkThreshold = SMALL_CHUNK_THRESHOLD;

  // 第一步：对小于smallChunkThreshold的连续小块进行两两合并（多轮迭代直到无法继续合并）
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
          tempChunks.push(mergeChunksWithDedup(currentChunk, nextChunk));
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

  // 第二步：装箱式合并 - 避免小块单独成块，同时去重标题
  const maxBoxSize = chunkSize * CHUNK_SIZE_MULTIPLIER;
  const mergedChunks: string[] = [];
  let currentBox = '';

  for (let i = 0; i < preProcessedChunks.length; i++) {
    const chunk = preProcessedChunks[i];
    const chunkLength = getTextValidLength(chunk);

    // 检测并去除重复的父标题
    let chunkToAdd = chunk;
    if (currentBox) {
      const currentBoxAllHeaders = extractAllHeaders(currentBox);
      const chunkLeadingHeaders = extractLeadingHeaders(chunk);

      if (chunkLeadingHeaders.length > 0) {
        const matchCount = countMatchingPrefixHeaders(currentBoxAllHeaders, chunkLeadingHeaders);
        if (matchCount > 0) {
          chunkToAdd = removeLeadingHeaders(chunk, matchCount);
        }
      }
    }

    const testBox = currentBox ? currentBox + '\n\n' + chunkToAdd : chunk;
    const testBoxLength = getTextValidLength(testBox);

    // 如果装入当前chunk后不超过盒子最大容量，则装入
    if (testBoxLength <= maxBoxSize) {
      currentBox = testBox;
    } else {
      const currentBoxLength = getTextValidLength(currentBox);

      // 如果当前盒子小于smallChunkThreshold，强制装入当前chunk（即使超过maxBoxSize）
      if (currentBoxLength < smallChunkThreshold && currentBox) {
        currentBox = testBox;
      } else {
        // 当前盒子足够大，可以独立成块
        if (currentBox) {
          mergedChunks.push(currentBox);
        }

        // 开始新盒子，装入当前chunk
        // 去除与前一个盒子重复的标题
        if (mergedChunks.length > 0) {
          const prevBoxHeaders = extractLeadingHeaders(mergedChunks[mergedChunks.length - 1]);
          const chunkHeaders = extractLeadingHeaders(chunk);
          const commonPrefixLength = getCommonHeaderPrefixLength(prevBoxHeaders, chunkHeaders);
          currentBox = commonPrefixLength > 0 ? removeLeadingHeaders(chunk, commonPrefixLength) : chunk;
        } else {
          currentBox = chunk;
        }

        // 检查当前chunk是否太小，如果是最后一个chunk则无所谓，否则强制与下一个合并
        if (chunkLength < smallChunkThreshold && i < preProcessedChunks.length - 1) {
          const nextChunkDeduplicated = (() => {
            const currentHeaders = extractLeadingHeaders(currentBox);
            const nextHeaders = extractLeadingHeaders(preProcessedChunks[i + 1]);
            const commonLen = getCommonHeaderPrefixLength(currentHeaders, nextHeaders);
            return commonLen > 0 ? removeLeadingHeaders(preProcessedChunks[i + 1], commonLen) : preProcessedChunks[i + 1];
          })();
          currentBox = currentBox + '\n\n' + nextChunkDeduplicated;
          i++; // 跳过下一个chunk
        }
      }
    }
  }

  // 最后一个盒子
  if (currentBox) {
    mergedChunks.push(currentBox);
  }

  // 边界检查：如果没有任何chunk，直接返回空结果
  if (mergedChunks.length === 0) {
    return {
      chunks: [],
      chars: 0
    };
  }

  return {
    chunks: mergedChunks,
    chars: mergedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  };
};
