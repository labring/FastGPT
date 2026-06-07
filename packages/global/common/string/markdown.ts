import { batchRun } from '../system/utils';
import { simpleText } from './tools';

/* Delete redundant text in markdown */
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
  const reg1 = /\\([#`!*()+-_\[\]{}\\.])/g;
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
        const cells = row.match(/<td[^>]*\/>|<td[^>]*>.*?<\/td>/g) || [];

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
            content = cell.replace(/<td[^>]*>|<\/td>/g, '').trim();
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

      const headerCells = tableData[0]
        .slice(0, maxColumns)
        .map((cell) => (cell === '^^' ? ' ' : cell || ' '));
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

type MarkdownImageBase = {
  altText: string;
  url: string;
  fullMatch: string;
  index: number;
};

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
const unescapeMarkdownUrl = (url: string) => url.replace(/\\([\\()])/g, '$1');

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

const findMarkdownImageUrlEnd = (text: string, startIndex: number) => {
  let depth = 0;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (char === '\\') {
      i++;
      continue;
    }

    if (char === '(') {
      depth++;
      continue;
    }

    if (char === ')') {
      if (depth === 0) return i;
      depth--;
    }
  }

  return -1;
};

/**
 * 扫描 markdown 图片节点，支持 URL 中包含未转义括号或转义右括号的场景。
 *
 * 普通正则 `!\[...\]\(([^)]+)\)` 会在 `https://a.com/img(1).png` 的第一个 `)` 截断，
 * 导致 http 图片转存失败；这里用轻量扫描保留完整节点范围。
 */
const matchMarkdownImages = (text: string) => {
  const matches: MarkdownImageBase[] = [];
  let start = 0;

  while (start < text.length) {
    const imageStart = text.indexOf('![', start);
    if (imageStart === -1) break;

    const altStart = imageStart + 2;
    const altEnd = findClosingBracket(text, altStart);
    if (altEnd === -1 || text[altEnd + 1] !== '(') {
      start = imageStart + 2;
      continue;
    }

    const urlStart = altEnd + 2;
    const urlEnd = findMarkdownImageUrlEnd(text, urlStart);
    if (urlEnd === -1) {
      start = imageStart + 2;
      continue;
    }

    const fullMatch = text.slice(imageStart, urlEnd + 1);
    matches.push({
      altText: text.slice(altStart, altEnd),
      url: text.slice(urlStart, urlEnd),
      fullMatch,
      index: imageStart
    });

    start = urlEnd + 1;
  }

  return matches;
};

/**
 * 处理 markdown 图片语法中的图片，并统一执行 markdown 文本清理。
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
  const images = matchMarkdownImages(text).flatMap<MarkdownImage>((match) => {
    const { fullMatch, altText, url: rawUrl, index } = match;
    const url = unescapeMarkdownUrl(rawUrl);
    const base64Match = url.match(mdBase64ImageSrcRegex);

    if (parseBase64 && base64Match) {
      const [, mime, base64] = base64Match;

      return [
        {
          type: 'base64',
          altText,
          url,
          dataUrl: url,
          mime: `image/${mime}`,
          base64,
          fullMatch,
          index
        }
      ];
    }

    if (parseHttp && mdHttpImageSrcRegex.test(url)) {
      return [
        {
          type: 'http',
          altText,
          url,
          fullMatch,
          index
        }
      ];
    }

    return [];
  });

  if (images.length === 0) return simpleMarkdownText(text);

  const preservedMarkdownImages = new Map<string, string>();
  const preserveMarkdownImage = (image: MarkdownImage, index: number) => {
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
            return key ? `![${image.altText}](${key})` : '';
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
