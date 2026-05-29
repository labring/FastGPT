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
  svg = 'svg',
  video = 'video',
  audio = 'audio'
}

export const mdTextFormat = (text: string) => {
  // 处理 Windows 文件路径中的反斜杠，防止被 Markdown 转义：C:\path\file 或 c:\path\file
  text = text.replace(/([A-Za-z]:\\[^\s`\[\]()]*)/g, (match) => {
    return match.replace(/\\/g, '\\\\');
  });

  // 修复图片 alt 文本中含有未闭合的 [ 导致 CommonMark 解析失败的问题。
  // CommonMark 规则：alt 文本中的 [ 会打开嵌套层级，若对应的 ] 被转义为 \]，
  // 则嵌套永远无法关闭，导致图片整体解析失败（渲染为纯文本而非图片）。
  // 修复方式：将 alt 文本中未转义的 [ 替换为 \[，使其在 Markdown 中作为字面字符处理。
  // 注意：此步骤需在 LaTeX 转换之前执行，以便后续 \[...\] → $$...$$ 正常工作。
  text = text.replace(/!\[([^!]*?)\]\((https?:\/\/[^)\s]+)\)/g, (match, alt, url) => {
    if (!alt.includes('[')) return match;
    const fixedAlt = alt.replace(/(?<!\\)\[/g, '\\[');
    return `![${fixedAlt}](${url})`;
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

  // 去掉引用前多余的换行，防止引用徽章另起一行显示
  text = text.replace(/\n+((?:\[[a-f0-9]{24}\]\((?:CITE|QUOTE)[^)]*\)\s*)+)(?=\n|$)/g, '$1');

  return text;
};

/**
 * 将 Markdown 图片语法转换为 HTML img 标签
 * 修复图片在 HTML 块（如 <table>、<div>）内无法渲染的问题：
 * remark 不处理原始 HTML 块内的内联 Markdown 语法，
 * 转换为 <img> 后 rehype-raw 可以正确解析。
 * 代码块内的图片语法会被跳过。
 */
export const convertMdImagesToHtml = (text: string): string => {
  const pattern = /(```[\s\S]*?```|`[^`]+`)|(!\[([^\]]*)\]\(([^)]+)\))/g;
  return text.replace(pattern, (match, codeBlock, _imageMatch, alt, src) => {
    if (codeBlock) return codeBlock;
    const escapedAlt = (alt || '').replace(/"/g, '&quot;');
    return `<img src="${src}" alt="${escapedAlt}">`;
  });
};

const SHIMMER_DIV =
  '<div class="img-stream-placeholder"><div class="img-stream-placeholder-inner"></div></div>';

const COMPLETE_IMG_RE = /!\[[^\]]*\]\([^)]+\)/g;
const INCOMPLETE_IMG_RE = /!\[[^\]]*(?:\](?:\([^)]*)?)?$/;

/**
 * 流式输出过程中检测末尾不完整的图片语法（如 ![](url 还没闭合)，
 * 替换为 shimmer 占位符，避免用户看到逐字输出的原始图片 markdown 文本。
 * 仅在 showAnimation 为 true 时处理；历史消息中图片语法都是完整的，不受影响。
 */
export const resolveImgStreamPlaceholder = (text: string, showAnimation: boolean): string => {
  if (!showAnimation) return text;

  let result = '';
  let lastEnd = 0;

  COMPLETE_IMG_RE.lastIndex = 0;
  let completeMatch: RegExpExecArray | null;

  while ((completeMatch = COMPLETE_IMG_RE.exec(text)) !== null) {
    // Check the segment before this complete match for incomplete syntax
    const segment = text.slice(lastEnd, completeMatch.index);
    const incompleteMatch = INCOMPLETE_IMG_RE.exec(segment);

    if (incompleteMatch) {
      result += segment.slice(0, incompleteMatch.index) + SHIMMER_DIV;
      result += segment.slice(incompleteMatch.index + incompleteMatch[0].length);
    } else {
      result += segment;
    }

    result += completeMatch[0];
    lastEnd = completeMatch.index + completeMatch[0].length;
  }

  // Handle the final segment after the last complete match
  const finalSegment = text.slice(lastEnd);
  const finalIncomplete = INCOMPLETE_IMG_RE.exec(finalSegment);

  if (finalIncomplete) {
    result += finalSegment.slice(0, finalIncomplete.index) + SHIMMER_DIV;
    result += finalSegment.slice(finalIncomplete.index + finalIncomplete[0].length);
  } else {
    result += finalSegment;
  }

  return result;
};
