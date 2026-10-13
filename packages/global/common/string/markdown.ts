import { batchRun } from '../system/utils';
import { simpleText } from './tools';

/** 清理 Markdown 冗余格式，仅移除指定特殊字符前的转义，保留普通文本中的反斜杠。 */
export const simpleMarkdownText = (rawText: string) => {
  rawText = simpleText(rawText);

  // Remove a line feed from a hyperlink or picture
  rawText = rawText.replace(/\[([^\]]+)\]\((.+?)\)/g, (match, linkText, url) => {
    const cleanedLinkText = linkText.replace(/\n/g, ' ').trim();

    if (!url) {
      return '';
    }

    return `[${cleanedLinkText}](${url})`;
  });

  // replace special #\.* ……
  // 连字符放在字符组末尾，避免形成包含数字和大写字母的 +-_ 范围。
  const reg1 = /\\([#`!*()+_\[\]{}\\.-])/g;
  if (reg1.test(rawText)) {
    rawText = rawText.replace(reg1, '$1');
  }

  // replace \\n
  rawText = rawText.replace(/\\\\n/g, '\\n');

  // Remove headings and code blocks front spaces
  ['####', '###', '##', '#', '```', '~~~'].forEach((item) => {
    const reg = new RegExp(`\\n\\s*${item}`, 'g');
    if (reg.test(rawText)) {
      rawText = rawText.replace(new RegExp(`(\\n)( *)(${item})`, 'g'), '$1$3');
    }
  });

  return rawText.trim();
};

export const htmlTable2Md = (content: string): string => {
  return content.replace(/<table>[\s\S]*?<\/table>/g, (htmlTable) => {
    try {
      // Clean up whitespace and newlines
      const cleanHtml = htmlTable.replace(/\n\s*/g, '');
      const rows = cleanHtml.match(/<tr>(.*?)<\/tr>/g);
      if (!rows) return htmlTable;

      // Parse table data
      const tableData: string[][] = [];
      let maxColumns = 0;

      // Try to convert to markdown table
      rows.forEach((row, rowIndex) => {
        if (!tableData[rowIndex]) {
          tableData[rowIndex] = [];
        }
        let colIndex = 0;
        // HTML 表头用 <th>，数据用 <td>。只匹配 td 时，标准 thead/th
        // 表格会丢掉列名，混用 th 行头的行也会缺列。
        const cells = row.match(/<t[dh][^>]*\/>|<t[dh][^>]*>.*?<\/t[dh]>/g) || [];

        cells.forEach((cell) => {
          while (tableData[rowIndex][colIndex]) {
            colIndex++;
          }
          const colspan = parseInt(cell.match(/colspan="(\d+)"/)?.[1] || '1');
          const rowspan = parseInt(cell.match(/rowspan="(\d+)"/)?.[1] || '1');
          let content = '';
          if (cell.endsWith('/>')) {
            content = '';
          } else {
            content = cell.replace(/<t[dh][^>]*>|<\/t[dh]>/g, '').trim();
          }
          for (let i = 0; i < rowspan; i++) {
            for (let j = 0; j < colspan; j++) {
              if (!tableData[rowIndex + i]) {
                tableData[rowIndex + i] = [];
              }
              tableData[rowIndex + i][colIndex + j] = i === 0 && j === 0 ? content : '^^';
            }
          }
          colIndex += colspan;
          maxColumns = Math.max(maxColumns, colIndex);
        });

        for (let i = 0; i < maxColumns; i++) {
          if (!tableData[rowIndex][i]) {
            tableData[rowIndex][i] = ' ';
          }
        }
      });
      const chunks: string[] = [];

      // 表头行可能比后面的数据行窄（首行只有标题单元格），列数不足会让分隔行
      // 少于数据列，Markdown 渲染时多出来的列会被丢弃，这里和数据行一样补齐。
      const headerCells = tableData[0]
        .slice(0, maxColumns)
        .map((cell) => (cell === '^^' ? ' ' : cell || ' '));
      while (headerCells.length < maxColumns) {
        headerCells.push(' ');
      }
      const headerRow = '| ' + headerCells.join(' | ') + ' |';
      chunks.push(headerRow);

      const separator = '| ' + Array(headerCells.length).fill('---').join(' | ') + ' |';
      chunks.push(separator);

      tableData.slice(1).forEach((row) => {
        const paddedRow = row
          .slice(0, maxColumns)
          .map((cell) => (cell === '^^' ? ' ' : cell || ' '));
        while (paddedRow.length < maxColumns) {
          paddedRow.push(' ');
        }
        chunks.push('| ' + paddedRow.join(' | ') + ' |');
      });

      return chunks.join('\n');
    } catch {
      return htmlTable;
    }
  });
};

export type MatchedImageUploadResult = {
  key: string;
  previewUrl?: string;
};

export type MarkdownImageMatchItem = {
  altText: string;
  url: string;
  fullMatch: string;
  index: number;
};

export type MarkdownImageBase = MarkdownImageMatchItem;

export type MarkdownImage = MarkdownImageBase &
  (
    | {
        type: 'base64';
        dataUrl: string;
        mime: string;
        base64: string;
      }
    | {
        type: 'http';
      }
  );

type MarkdownImageUploadController = (image: MarkdownImage) => Promise<MatchedImageUploadResult>;

export type MarkdownImageParseOptions = {
  parseBase64?: boolean;
  parseHttp?: boolean;
  controller?: MarkdownImageUploadController;
  controler?: MarkdownImageUploadController;
};

const mdBase64ImageSrcRegex = /^data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)$/;
const mdHttpImageSrcRegex = /^https?:\/\/.+/;
const markdownImageUploadConcurrency = 5;

/**
 * 判断字符是否属于 CommonMark 定义的 ASCII 标点，供目的地址反转义使用。
 * 仅反转义 ASCII 标点，避免把 URL 中的普通反斜杠序列（如 `\\n`）误改写。
 */
const isAsciiPunctuation = (char: string) => {
  const code = char.charCodeAt(0);
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
};

/**
 * 还原 Markdown 图片目的地址中的反斜杠转义。
 * CommonMark 允许所有 ASCII 标点被转义，包含尖括号目的地址中的 `\\<` 与 `\\>`。
 */
export const unescapeMarkdownImageUrl = (url: string) =>
  url.replace(/\\([\s\S])/g, (match, char: string) => (isAsciiPunctuation(char) ? char : match));

/**
 * HTML <img> 标签正则片段（各含 1 个捕获组，value 含 3 个）：
 * - prefix：按属性 token 消费 src 之前的所有内容，避免命中引号属性值内的 `src=` 文本
 * - value：src 值（双引号 / 单引号 / 无引号）
 * - suffix：src 之后的剩余标签内容
 *
 * 供本包 matchDocumentImages 与 service 侧 S3 key 预览正则共享，
 * 拼接时保持 prefix→value→suffix 顺序即可维持各自既有捕获组编号。
 */
export const htmlImgTokenPrefixPattern = String.raw`(<img\b(?:(?:[^"'<>]|"[^"]*"|'[^']*'))*?\s+src\s*=\s*)`;
export const htmlImgTokenValuePattern = '(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+))';
export const htmlImgTokenSuffixPattern = String.raw`((?:(?:[^"'<>]|"[^"]*"|'[^']*'))*>)`;

const htmlImgTokenRegex = new RegExp(
  `${htmlImgTokenPrefixPattern}${htmlImgTokenValuePattern}${htmlImgTokenSuffixPattern}`,
  'gi'
);

const htmlImgAttrTokenRegex =
  /(?:^|\s)([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

/**
 * 在 HTML 标签文本上按属性 token 逐个消费取值，避免值内部出现 `alt=`、`src=`
 * 等字样时被子串误命中（属性串味）。
 */
const getHtmlImgAttrToken = (tag: string, name: string): string | undefined => {
  htmlImgAttrTokenRegex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = htmlImgAttrTokenRegex.exec(tag)) !== null) {
    if (match[1].toLowerCase() === name) {
      return (match?.[2] ?? match?.[3] ?? match?.[4])?.trim();
    }
  }

  return undefined;
};

export type DocumentImageItem = {
  /** markdown: `![alt](url)` 语法；html: `<img src="url" ...>` 标签 */
  format: 'markdown' | 'html';
  altText: string;
  url: string;
  fullMatch: string;
  index: number;
  /**
   * 闭包封装语法形态的替换逻辑：markdown 重建 `![alt](nextUrl)`；
   * html 保留标签结构仅替换 src（表格 HTML 块内的 markdown 语法不会被渲染）。
   * nextUrl 为空时整体移除。
   */
  replace: (nextUrl: string) => string;
};

/**
 * 统一扫描文档图片占位符：markdown 图片语法与 HTML `<img>` 标签。
 *
 * HTML 形态主要来自外部解析服务保留的表格（docx/xlsx 单元格内嵌
 * `<img src="data:image/...;base64,...">`）。单次扫描输出按偏移排序的
 * 无重叠区间，防止嵌套语法（如属性值内含另一形态的图片语法）导致
 * 文本切片回退损坏。
 */
export const matchDocumentImages = (text = ''): DocumentImageItem[] => {
  if (!text || typeof text !== 'string') return [];

  const rawMatches: DocumentImageItem[] = [];

  for (const item of scanMarkdownImages(text)) {
    rawMatches.push({
      format: 'markdown',
      altText: item.altText,
      url: item.url,
      fullMatch: item.fullMatch,
      index: item.index,
      replace: item.replace
    });
  }

  htmlImgTokenRegex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = htmlImgTokenRegex.exec(text)) !== null) {
    const [, prefix, doubleQuoted, singleQuoted, unquoted, suffix] = match;
    const url = (doubleQuoted ?? singleQuoted ?? unquoted)?.trim() || '';
    if (!url) continue;

    const altText = getHtmlImgAttrToken(match[0], 'alt') ?? '';
    const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '"';

    rawMatches.push({
      format: 'html',
      altText,
      url,
      fullMatch: match[0],
      index: match.index,
      replace: (nextUrl: string) => (nextUrl ? `${prefix}${quote}${nextUrl}${quote}${suffix}` : '')
    });
  }

  rawMatches.sort((left, right) => left.index - right.index);

  const safeMatches: DocumentImageItem[] = [];
  let lastOccupiedEnd = 0;

  for (const item of rawMatches) {
    if (item.index >= lastOccupiedEnd) {
      safeMatches.push(item);
      lastOccupiedEnd = item.index + item.fullMatch.length;
    }
  }

  return safeMatches;
};

const findClosingBracket = (text: string, startIndex: number) => {
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }

    if (text[i] === ']') return i;
  }

  return -1;
};

/**
 * 扫描行内图片，区分目的地址与可选标题，并记录仅替换地址的闭包。
 * 裸地址配对括号，尖括号地址按 > 结束；标题不参与 URL 识别。
 * 不完整节点跳过后继续扫描，不改变既有 HTML 图片的重叠过滤逻辑。
 */
const scanMarkdownImages = (text = '') => {
  if (!text || typeof text !== 'string') return [];

  const matches: (MarkdownImageMatchItem & {
    replace: DocumentImageItem['replace'];
    replaceAltText: (nextAltText: string) => string;
  })[] = [];
  let start = 0;

  /** 只用于本次扫描，返回原文中的地址区间和图片结束位置。 */
  const readDestination = (contentStart: number) => {
    let cursor = contentStart;
    const skipWhitespace = () => {
      let lineEndingCount = 0;

      while (cursor < text.length) {
        const char = text[cursor];
        if (char === ' ' || char === '\t') {
          cursor++;
          continue;
        }
        if (char === '\r') {
          lineEndingCount++;
          cursor += text[cursor + 1] === '\n' ? 2 : 1;
          continue;
        }
        if (char === '\n') {
          lineEndingCount++;
          cursor++;
          continue;
        }
        break;
      }

      // Inline link components may be separated by spaces/tabs and at most one line ending.
      return lineEndingCount <= 1;
    };
    if (!skipWhitespace()) return;
    const angled = text[cursor] === '<';
    if (angled) cursor++;
    const urlStart = cursor;
    let depth = 0;

    while (cursor < text.length) {
      const char = text[cursor];
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (angled) {
        if (char === '>') break;
        if (char === '<' || char === '\r' || char === '\n') return;
      } else {
        if (/[ \t\r\n]/.test(char) || (char === ')' && depth === 0)) break;
        if (char === '(') depth++;
        if (char === ')') depth--;
      }
      cursor++;
    }
    if (depth !== 0 || (angled && text[cursor] !== '>')) return;
    const urlEnd = cursor;
    if (angled) cursor++;
    const afterDestination = cursor;
    if (!skipWhitespace()) return;

    if (text[cursor] !== ')') {
      // 标题必须由空白分隔；引号或括号包裹的说明不能送给下载回调。
      if (cursor === afterDestination) return;
      const opening = text[cursor];
      if (opening !== '"' && opening !== "'" && opening !== '(') return;
      const closing = opening === '(' ? ')' : opening;
      cursor++;
      let titleLineHasContent = false;
      while (cursor < text.length && text[cursor] !== closing) {
        if (text[cursor] === '\\') {
          cursor += 2;
          titleLineHasContent = true;
          continue;
        }
        if (text[cursor] === '\r' || text[cursor] === '\n') {
          if (!titleLineHasContent) return;
          titleLineHasContent = false;
          cursor += text[cursor] === '\r' && text[cursor + 1] === '\n' ? 2 : 1;
          continue;
        }
        if (opening === '(' && text[cursor] === '(') return;
        if (text[cursor] !== ' ' && text[cursor] !== '\t') {
          titleLineHasContent = true;
        }
        cursor++;
      }
      if (cursor >= text.length) return;
      cursor++;
      if (!skipWhitespace()) return;
    }
    if (text[cursor] !== ')') return;
    return { urlStart, urlEnd, imageEnd: cursor + 1 };
  };

  while (start < text.length) {
    const imageStart = text.indexOf('![', start);
    if (imageStart === -1) break;

    const altStart = imageStart + 2;
    const altEnd = findClosingBracket(text, altStart);
    if (altEnd === -1 || text[altEnd + 1] !== '(') {
      start = imageStart + 2;
      continue;
    }

    const destination = readDestination(altEnd + 2);
    if (!destination) {
      start = imageStart + 2;
      continue;
    }

    const { urlStart, urlEnd, imageEnd } = destination;
    const fullMatch = text.slice(imageStart, imageEnd);
    matches.push({
      altText: text.slice(altStart, altEnd),
      url: text.slice(urlStart, urlEnd),
      fullMatch,
      index: imageStart,
      // 保留 alt、空白、尖括号和标题，仅替换原地址，空 key 仍删除整个节点。
      replace: (nextUrl) =>
        nextUrl
          ? fullMatch.slice(0, urlStart - imageStart) +
            nextUrl +
            fullMatch.slice(urlEnd - imageStart)
          : '',
      replaceAltText: (nextAltText) =>
        fullMatch.slice(0, altStart - imageStart) +
        nextAltText +
        fullMatch.slice(altEnd - imageStart)
    });

    start = imageEnd;
  }

  return matches;
};

/** 提取图片 URL 与完整原文节点；保留既有返回结构，不暴露内部替换闭包。 */
export const matchMarkdownImages = (text = ''): MarkdownImageMatchItem[] =>
  scanMarkdownImages(text).map(
    ({ replace: _replace, replaceAltText: _replaceAltText, ...item }) => item
  );

/**
 * 替换 Markdown 图片的 alt 文本并保留目的地址、标题和原始分隔符。
 * 仅接受完整的单个图片节点，避免对格式不完整的片段产生猜测式改写。
 */
export const replaceMarkdownImageAltText = (fullMatch: string, nextAltText: string) => {
  const match = scanMarkdownImages(fullMatch)[0];
  if (!match || match.index !== 0 || match.fullMatch !== fullMatch) return fullMatch;
  return match.replaceAltText(nextAltText);
};

type ParsedDocumentImage = MarkdownImage & { item: DocumentImageItem };

/**
 * 处理文档图片（markdown 语法与 HTML <img> 标签），并统一执行 markdown 文本清理。
 *
 * base64 图片默认会被解析：传入上传回调时替换成对象存储 key，不传回调或上传失败时删除，
 * 避免大体积 base64 继续在解析链路中流转。http 图片默认不处理，开启后可复用同一个
 * 上传回调转存；没有回调或转存失败时保留原 URL。
 */
export const parseMarkdownBase64Images = async (
  text: string,
  imageOptions: MarkdownImageParseOptions = {}
) => {
  const {
    parseBase64 = true,
    parseHttp = false,
    controller = imageOptions.controler
  } = imageOptions;

  const images: ParsedDocumentImage[] = [];

  for (const item of matchDocumentImages(text)) {
    const url = item.format === 'markdown' ? unescapeMarkdownImageUrl(item.url) : item.url;
    const base64Match = parseBase64 ? url.match(mdBase64ImageSrcRegex) : null;

    if (base64Match) {
      const [, mime, base64] = base64Match;

      images.push({
        type: 'base64',
        altText: item.altText,
        url,
        dataUrl: url,
        mime: `image/${mime}`,
        base64,
        fullMatch: item.fullMatch,
        index: item.index,
        item
      });
      continue;
    }

    if (parseHttp && mdHttpImageSrcRegex.test(url)) {
      images.push({
        type: 'http',
        altText: item.altText,
        url,
        fullMatch: item.fullMatch,
        index: item.index,
        item
      });
    }
  }

  if (images.length === 0) return simpleMarkdownText(text);

  const preservedMarkdownImages = new Map<string, string>();
  const preserveMarkdownImage = (image: ParsedDocumentImage, index: number) => {
    const token = `__FASTGPT_MARKDOWN_IMAGE_${index}_PLACEHOLDER__`;
    preservedMarkdownImages.set(token, image.fullMatch);
    return token;
  };

  const uploadResults = controller
    ? await batchRun(
        images,
        async (image, index) => {
          try {
            // 上传回调返回的是对象存储 key，markdown 中先保留 key，后续业务层再决定是否签名成 URL。
            const { key } = await controller(image);
            return key ? image.item.replace(key) : '';
          } catch {
            return image.type === 'http' ? preserveMarkdownImage(image, index) : '';
          }
        },
        markdownImageUploadConcurrency
      )
    : images.map((image, index) =>
        image.type === 'http' ? preserveMarkdownImage(image, index) : ''
      );

  let result = '';
  let lastIndex = 0;

  for (const [index, image] of images.entries()) {
    result += text.slice(lastIndex, image.index);
    result += uploadResults[index];
    lastIndex = image.index + image.fullMatch.length;
  }

  const cleanedText = simpleMarkdownText(result + text.slice(lastIndex));

  return Array.from(preservedMarkdownImages.entries()).reduce(
    (text, [token, rawMarkdown]) => text.replaceAll(token, rawMarkdown),
    cleanedText
  );
};
