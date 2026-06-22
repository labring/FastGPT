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
  /\[[^\]\n]*\]\([^\s\n)]*$/
];
const streamingIncompleteTextMarkdownTailMarkers = ['**', '__', '~~'] as const;
const streamingIncompleteItalicMarkdownTailMarkers = ['*', '_'] as const;
const STREAMING_INCOMPLETE_MEDIA_MARKDOWN_TAIL_MAX_HIDE_LENGTH = 100;
const STREAMING_INCOMPLETE_TEXT_MARKDOWN_TAIL_MAX_HIDE_LENGTH = 50;

/**
 * 流式输出时隐藏尾部尚未闭合的 Markdown 片段。
 *
 * 该函数只处理“还在尾部继续生长”的候选语法，不补全括号，也不处理正文中间的
 * 不完整 Markdown。这样图片不会因为半截 URL 被提前请求；如果后续输出出现空白、
 * 换行等打断符，或候选片段过长，候选语法会按原文重新显示。
 */
export const hideStreamingIncompleteMarkdownTail = (text: string) => {
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

  const textMarkdownStartIndex = getStreamingIncompleteTextMarkdownTailStart(text);
  if (textMarkdownStartIndex !== undefined) {
    return text.slice(0, textMarkdownStartIndex);
  }

  return text;
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
