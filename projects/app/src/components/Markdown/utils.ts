import remend, { type RemendOptions } from 'remend';

export enum CodeClassNameEnum {
  guide = 'guide',
  questionguide = 'questionguide',
  mermaid = 'mermaid',
  echarts = 'echarts',
  quote = 'quote',
  files = 'files',
  latex = 'latex',
  iframe = 'iframe',
  html = 'html',
  htm = 'htm',
  svg = 'svg',
  video = 'video',
  audio = 'audio',
  quickReplies = 'quick-replies'
}

const streamingIncompleteMarkdownTailPatterns = [
  /!\[[^\]\n]*\]\([^\s\n)]*$/,
  /!\[[^\]\n]*\]$/,
  /!\[[^\]\n]*$/,
  /\[[a-f0-9]{0,24}\]\((?:CITE|QUOTE)?$/i,
  /\[[a-f0-9]{1,24}\]?$/i,
  /\[[^\]\n]*\]\([^\s\n)]*$/,
  /\[[^\]\n]*\]$/,
  /\[[^\]\n]*$/,
  /<(?:https?:\/\/|mailto:)[^\s>]*$/i
];
const streamingIncompleteTextMarkdownTailMarkers = ['**', '__', '~~'] as const;
const streamingIncompleteItalicMarkdownTailMarkers = ['*', '_'] as const;
const STREAMING_INCOMPLETE_MEDIA_MARKDOWN_TAIL_MAX_HIDE_LENGTH = 100;
const STREAMING_INCOMPLETE_TEXT_MARKDOWN_TAIL_MAX_HIDE_LENGTH = 50;
const streamingRemendOptions = {
  bold: false,
  boldItalic: false,
  comparisonOperators: false,
  htmlTags: false,
  images: false,
  inlineCode: false,
  inlineKatex: false,
  italic: false,
  katex: true,
  links: false,
  setextHeadings: false,
  singleTilde: false,
  strikethrough: false
} satisfies RemendOptions;

const streamingBlockControlTailPattern =
  /(^|\n)[ \t]{0,3}(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]?\]?|[*_]{1,3}|~~|`{1,2}|\${1,2})|#{1,6}|>+|\+|\d{1,9}[.)]?|[-*_]+|=+|~~|`{1,2}|\${1,2})[ \t]*$/;

/**
 * 隐藏尚未携带正文的块级控制标记，避免它先作为文本出现，随后又被重建为块节点。
 */
const hideStreamingBlockControlTail = (text: string) => {
  const match = text.match(streamingBlockControlTailPattern);
  return match?.index === undefined ? text : text.slice(0, match.index);
};

/**
 * 延迟潜在 GFM 表格头，直到分隔行完整或下一行证明它只是普通文本。
 *
 * 表格在分隔行完成前会被解析为 paragraph，完成后整块变成 table；提前显示表头会导致
 * 已有 DOM 被整体替换。这里只延迟以 `|` 开头的常见流式表格，避免影响正文里的竖线。
 */
const hideStreamingTableTail = (text: string) => {
  if (text.endsWith('\n\n')) return text;

  const blockSeparatorIndex = text.lastIndexOf('\n\n');
  const blockStart = blockSeparatorIndex < 0 ? 0 : blockSeparatorIndex + 2;
  const block = text.slice(blockStart);
  const lines = block.split('\n');
  if (lines.length > 2) return text;

  const header = lines[0].trim();
  if (!header.startsWith('|')) return text;
  if (lines.length === 1 || lines[1].trim() === '') return text.slice(0, blockStart);

  const delimiter = lines[1].trim();
  const headerCells = header.replace(/^\|/, '').replace(/\|$/, '').split('|');
  const delimiterCells = delimiter.replace(/^\|/, '').replace(/\|$/, '').split('|');
  const isCompleteDelimiter =
    headerCells.length >= 2 &&
    delimiterCells.length >= 2 &&
    delimiterCells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
  if (isCompleteDelimiter) return text;

  return /^[|:\-\s]*$/.test(delimiter) ? text.slice(0, blockStart) : text;
};

/** 返回当前仍打开的 fenced code 起点，避免修复器改写代码内容。 */
const getStreamingOpenCodeFenceStart = (text: string) => {
  const fencePattern = /(^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\n]*/g;
  let openFence: { char: '`' | '~'; length: number; start: number } | undefined;

  for (const match of text.matchAll(fencePattern)) {
    const marker = match[2];
    const markerChar = marker[0] as '`' | '~';

    if (openFence?.char === markerChar && marker.length >= openFence.length) {
      openFence = undefined;
    } else if (!openFence) {
      openFence = {
        char: markerChar,
        length: marker.length,
        start: (match.index ?? 0) + match[1].length
      };
    }
  }

  return openFence?.start;
};

type StreamingEmphasisMarker = '*' | '_' | '**' | '__' | '***' | '___' | '~~';

const streamingEmphasisMarkerLengths = [3, 2, 1] as const;

/**
 * 为尾部仍打开的强调语法补齐闭合符。
 *
 * remend 能修复单层强调，但嵌套强调的真实闭合符逐字符到达时会暂时改变 AST。例如
 * `**bold *italic` 的稳定后缀应为 `***`，而不是只闭合最内层。这里用轻量 delimiter
 * 栈覆盖流式输出中常见的嵌套组合，代码片段仍交给 remend 处理。
 */
const completeStreamingEmphasis = (text: string) => {
  const stack: StreamingEmphasisMarker[] = [];
  let inlineCodeMarkerLength: number | undefined;
  let hasPartialInlineCodeMarkerAtTail = false;
  let codeFence: { char: '`' | '~'; length: number } | undefined;

  const isEscapedAt = (index: number) => {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
      slashCount += 1;
    }
    return slashCount % 2 === 1;
  };
  const isWhitespace = (char?: string) => char === undefined || /\s/.test(char);
  const isDelimiterBoundary = (char?: string) => char === undefined || !/[\p{L}\p{N}_]/u.test(char);
  const isCodeFenceAt = (index: number, marker: '`' | '~', runLength: number) => {
    if (runLength < 3) return false;
    let indentation = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] !== '\n'; cursor -= 1) {
      if (text[cursor] !== ' ' && text[cursor] !== '\t') return false;
      indentation += 1;
      if (indentation > 3) return false;
    }
    return true;
  };
  const getRunLength = (index: number, char: string) => {
    let length = 1;
    while (text[index + length] === char) length += 1;
    return length;
  };

  for (let index = 0; index < text.length; ) {
    const char = text[index];

    if (char === '`' && !isEscapedAt(index)) {
      const runLength = getRunLength(index, char);
      if (codeFence && codeFence.char !== char) {
        index += runLength;
        continue;
      }
      if (isCodeFenceAt(index, char, runLength)) {
        codeFence =
          codeFence?.char === char && runLength >= codeFence.length
            ? undefined
            : { char, length: runLength };
        index += runLength;
        continue;
      }
      if (codeFence) {
        index += runLength;
        continue;
      }
      if (runLength < 3) {
        if (
          inlineCodeMarkerLength !== undefined &&
          inlineCodeMarkerLength !== runLength &&
          index + runLength === text.length
        ) {
          hasPartialInlineCodeMarkerAtTail = true;
        }
        inlineCodeMarkerLength =
          inlineCodeMarkerLength === runLength ? undefined : (inlineCodeMarkerLength ?? runLength);
      }
      index += runLength;
      continue;
    }
    if (char === '~' && !isEscapedAt(index)) {
      const runLength = getRunLength(index, char);
      if (codeFence && codeFence.char !== char) {
        index += runLength;
        continue;
      }
      if (isCodeFenceAt(index, char, runLength)) {
        codeFence =
          codeFence?.char === char && runLength >= codeFence.length
            ? undefined
            : { char, length: runLength };
        index += runLength;
        continue;
      }
      if (codeFence) {
        index += runLength;
        continue;
      }
    }
    if (
      codeFence ||
      inlineCodeMarkerLength !== undefined ||
      isEscapedAt(index) ||
      !['*', '_', '~'].includes(char)
    ) {
      index += 1;
      continue;
    }

    const runLength = getRunLength(index, char);
    const previousChar = text[index - 1];
    const nextChar = text[index + runLength];
    let remainingLength = runLength;
    const canClose = !isWhitespace(previousChar) && isDelimiterBoundary(nextChar);

    // 尾部闭合符可能分多次到达，优先消费栈顶，保留同一嵌套关系。
    while (stack.length > 0 && stack.at(-1)?.[0] === char && canClose) {
      const marker = stack.at(-1)!;
      if (remainingLength < marker.length) {
        if (index + runLength < text.length) break;

        const missingCurrentMarker = char.repeat(marker.length - remainingLength);
        const missingOuterMarkers = stack.slice(0, -1).reverse().join('');
        return `${text}${missingCurrentMarker}${missingOuterMarkers}`;
      }

      remainingLength -= marker.length;
      stack.pop();
    }

    if (remainingLength > 0 && isDelimiterBoundary(previousChar) && !isWhitespace(nextChar)) {
      if (char === '~') {
        if (remainingLength >= 2) stack.push('~~');
      } else {
        for (const markerLength of streamingEmphasisMarkerLengths) {
          if (remainingLength < markerLength) continue;
          stack.push(char.repeat(markerLength) as StreamingEmphasisMarker);
          remainingLength -= markerLength;
        }
      }
    }

    index += runLength;
  }

  const inlineCodeSuffix = inlineCodeMarkerLength
    ? `${hasPartialInlineCodeMarkerAtTail ? ' ' : ''}${'`'.repeat(inlineCodeMarkerLength)}`
    : '';
  const emphasisSuffix = stack.reverse().join('');
  return inlineCodeSuffix || emphasisSuffix ? `${text}${inlineCodeSuffix}${emphasisSuffix}` : text;
};

/**
 * 流式输出时隐藏尾部尚未闭合的 Markdown 片段。
 *
 * 该函数只处理“还在尾部继续生长”的候选语法，不补全括号，也不处理正文中间的
 * 不完整 Markdown。这样图片不会因为半截 URL 被提前请求；如果后续输出出现空白、
 * 换行等打断符，或候选片段过长，候选语法会按原文重新显示。
 */
export const hideStreamingIncompleteMarkdownTail = (
  text: string,
  { hideTextFormatting = true }: { hideTextFormatting?: boolean } = {}
) => {
  const isEscapedAt = (text: string, index: number) => {
    let slashCount = 0;

    for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
      slashCount += 1;
    }

    return slashCount % 2 === 1;
  };

  const isInsideInlineCode = (text: string, index: number) => {
    let backtickCount = 0;

    for (let i = 0; i < index; i += 1) {
      if (text[i] !== '`' || isEscapedAt(text, i)) continue;

      if (text.substring(i, i + 3) === '```') {
        i += 2;
        continue;
      }

      backtickCount += 1;
    }

    return backtickCount % 2 === 1;
  };

  const isInsideOpenCodeFence = (text: string) => {
    const fences = text.match(/(^|\n)```/g);
    return !!fences && fences.length % 2 === 1;
  };

  const isWordChar = (char?: string) => {
    return !!char && /[\p{L}\p{N}_]/u.test(char);
  };

  const isWhitespace = (char?: string) => {
    return !!char && /\s/.test(char);
  };

  const isCodeFenceBacktickAt = (text: string, index: number) => {
    return (
      text.substring(index, index + 3) === '```' ||
      text.substring(index - 1, index + 2) === '```' ||
      text.substring(index - 2, index + 1) === '```'
    );
  };

  const getUnescapedMarkerPositions = (text: string, marker: string) => {
    const positions: number[] = [];

    for (let i = 0; i <= text.length - marker.length; i += 1) {
      if (text.substring(i, i + marker.length) !== marker) continue;
      if (isEscapedAt(text, i)) continue;
      if (marker === '`' && isCodeFenceBacktickAt(text, i)) continue;
      if (marker !== '`' && isInsideInlineCode(text, i)) continue;

      positions.push(i);
      i += marker.length - 1;
    }

    return positions;
  };

  const isSingleItalicMarkerAt = (text: string, index: number, marker: '*' | '_') => {
    if (text[index] !== marker) return false;
    if (isEscapedAt(text, index)) return false;
    if (isInsideInlineCode(text, index)) return false;
    if (text[index - 1] === marker || text[index + 1] === marker) return false;

    return true;
  };

  const getUnescapedSingleItalicMarkerPositions = (text: string, marker: '*' | '_') => {
    const positions: number[] = [];

    for (let i = 0; i < text.length; i += 1) {
      if (!isSingleItalicMarkerAt(text, i, marker)) continue;

      positions.push(i);
    }

    return positions;
  };

  const shouldHideStreamingTextMarkdownTail = ({
    text,
    startIndex,
    marker
  }: {
    text: string;
    startIndex: number;
    marker: string;
  }) => {
    if (text.length - startIndex > STREAMING_INCOMPLETE_TEXT_MARKDOWN_TAIL_MAX_HIDE_LENGTH) {
      return false;
    }

    const nextChar = text[startIndex + marker.length];
    if (isWhitespace(nextChar)) return false;

    // 双标记容易和普通文本粘连，要求左侧不是单词字符，降低误隐藏概率。
    if (marker !== '`' && isWordChar(text[startIndex - 1])) return false;

    return true;
  };

  const getStreamingIncompleteTextMarkdownTailStart = (text: string) => {
    const inlineCodePositions = getUnescapedMarkerPositions(text, '`');
    if (inlineCodePositions.length % 2 === 1) {
      const startIndex = inlineCodePositions[inlineCodePositions.length - 1];

      if (shouldHideStreamingTextMarkdownTail({ text, startIndex, marker: '`' })) {
        return startIndex;
      }
    }

    for (const marker of streamingIncompleteTextMarkdownTailMarkers) {
      const positions = getUnescapedMarkerPositions(text, marker);
      if (positions.length % 2 === 0) continue;

      const startIndex = positions[positions.length - 1];
      if (shouldHideStreamingTextMarkdownTail({ text, startIndex, marker })) {
        return startIndex;
      }
    }

    for (const marker of streamingIncompleteItalicMarkdownTailMarkers) {
      const positions = getUnescapedSingleItalicMarkerPositions(text, marker);
      if (positions.length % 2 === 0) continue;

      const startIndex = positions[positions.length - 1];
      if (shouldHideStreamingTextMarkdownTail({ text, startIndex, marker })) {
        return startIndex;
      }
    }
  };

  if (!text || isInsideOpenCodeFence(text)) return text;

  for (const pattern of streamingIncompleteMarkdownTailPatterns) {
    const match = text.match(pattern);
    const startIndex = match?.index;

    if (startIndex === undefined) continue;
    if (text[startIndex] === '[' && text[startIndex - 1] === '!') continue;
    if (isEscapedAt(text, startIndex)) continue;
    if (isInsideInlineCode(text, startIndex)) continue;
    if (text.length - startIndex > STREAMING_INCOMPLETE_MEDIA_MARKDOWN_TAIL_MAX_HIDE_LENGTH) {
      continue;
    }

    return text.slice(0, startIndex);
  }

  if (!hideTextFormatting) return text;

  const textMarkdownStartIndex = getStreamingIncompleteTextMarkdownTailStart(text);
  if (textMarkdownStartIndex !== undefined) {
    return text.slice(0, textMarkdownStartIndex);
  }

  return text;
};

/**
 * 为流式 Markdown 提供稳定的解析输入。
 *
 * 图片、链接和引用仍延迟到语法完整后再显示，避免请求半截 URL；粗体、斜体、删除线和
 * 行内代码则临时补齐尾部标记，使同一段文本从首次出现起就保持一致的 AST 结构。
 */
export const prepareStreamingMarkdown = (text: string) => {
  const sourceWithoutIncompleteMedia = hideStreamingIncompleteMarkdownTail(text, {
    hideTextFormatting: false
  });
  const openCodeFenceStart = getStreamingOpenCodeFenceStart(sourceWithoutIncompleteMedia);

  const repairSource = (source: string) => {
    const sourceWithoutIncompleteTable = hideStreamingTableTail(source);
    const sourceWithoutBlockControlTail = hideStreamingBlockControlTail(
      sourceWithoutIncompleteTable
    );
    const shouldRestoreTrailingSpace =
      sourceWithoutBlockControlTail.endsWith(' ') && !sourceWithoutBlockControlTail.endsWith('  ');
    const sourceForRepair = shouldRestoreTrailingSpace
      ? sourceWithoutBlockControlTail.slice(0, -1)
      : sourceWithoutBlockControlTail;
    const sourceWithCompletedEmphasis = completeStreamingEmphasis(sourceForRepair);
    const repairedSource = remend(sourceWithCompletedEmphasis, streamingRemendOptions);

    // remend 会移除单个尾随空格。放回闭合标记外，避免列表 marker 退化或空格进入强调。
    return shouldRestoreTrailingSpace ? `${repairedSource} ` : repairedSource;
  };

  if (openCodeFenceStart === undefined) return repairSource(sourceWithoutIncompleteMedia);
  return `${repairSource(sourceWithoutIncompleteMedia.slice(0, openCodeFenceStart))}${sourceWithoutIncompleteMedia.slice(openCodeFenceStart)}`;
};

export const mdTextFormat = (text: string) => {
  // 处理 Windows 文件路径中的反斜杠，防止被 Markdown 转义：C:\path\file 或 c:\path\file
  text = text.replace(/([A-Za-z]:\\[^\s`\[\]()]*)/g, (match) => {
    return match.replace(/\\/g, '\\\\');
  });

  // NextChat function - Format latex to $$
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g;
  text = text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock;
    } else if (squareBracket) {
      return `$$${squareBracket}$$`;
    } else if (roundBracket) {
      return `$${roundBracket}$`;
    }
    return match;
  });

  // 处理 [quote:id] 格式引用，将 [quote:675934a198f46329dfc6d05a] 转换为 [675934a198f46329dfc6d05a](CITE)
  text = text
    // 处理 格式引用，将 [675934a198f46329dfc6d05a] 转换为 [675934a198f46329dfc6d05a](CITE)
    .replace(/\[([a-f0-9]{24})\](?!\()/g, '[$1](CITE)');
  // 将 "http://localhost:3000[675934a198f46329dfc6d05a](CITE)" -> "http://localhost:3000 [675934a198f46329dfc6d05a](CITE)"
  text = text.replace(
    /(https?:\/\/[^\s，。！？；：、\[\]]+?)(?=\[([a-f0-9]{24})\]\(CITE\))/g,
    '$1 '
  );

  // 处理链接后的中文标点符号，增加空格
  text = text.replace(/(https?:\/\/[^\s，。！？；：、]+)([，。！？；：、])/g, '$1 $2');

  return text;
};
