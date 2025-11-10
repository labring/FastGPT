import { batchRun } from '../system/utils';
import { getNanoid, simpleText } from './tools';
import type { ImageType } from '../../../service/worker/readFile/type';

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
  ['####', '###', '##', '#', '```', '~~~'].forEach((item, i) => {
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
      let tableData: string[][] = [];
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
    } catch (error) {
      return htmlTable;
    }
  });
};

/**
 * format markdown
 * 1. upload base64
 * 2. replace \
 */
export const uploadMarkdownBase64 = async ({
  rawText,
  uploadImgController
}: {
  rawText: string;
  uploadImgController?: (base64: string) => Promise<string>;
}) => {
  if (uploadImgController) {
    // match base64, upload and replace it
    const base64Regex = /data:image\/.*;base64,([^\)]+)/g;
    const base64Arr = rawText.match(base64Regex) || [];

    // upload base64 and replace it
    await batchRun(
      base64Arr,
      async (base64Img) => {
        try {
          const str = await uploadImgController(base64Img);
          rawText = rawText.replace(base64Img, str);
        } catch (error) {
          rawText = rawText.replace(base64Img, '');
          rawText = rawText.replace(/!\[.*\]\(\)/g, '');
        }
      },
      20
    );
  }

  // Remove white space on both sides of the picture
  // const trimReg = /(!\[.*\]\(.*\))\s*/g;
  // if (trimReg.test(rawText)) {
  //   rawText = rawText.replace(trimReg, '$1');
  // }

  return rawText;
};

export const markdownProcess = async ({
  rawText,
  uploadImgController
}: {
  rawText: string;
  uploadImgController?: (base64: string) => Promise<string>;
}) => {
  const imageProcess = await uploadMarkdownBase64({
    rawText,
    uploadImgController
  });

  return simpleMarkdownText(imageProcess);
};

export const matchMdImg = (text: string) => {
  // 优化后的正则:
  // 1. 使用 [^\]]* 匹配 alt 文本(更精确)
  // 2. 使用 [A-Za-z0-9+/=]+ 匹配 base64 数据(避免回溯)
  // 3. 明确匹配 data:image/ 前缀
  const base64Regex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([A-Za-z0-9+/=]+))\)/g;
  const imageList: ImageType[] = [];

  text = text.replace(base64Regex, (_match, altText, _fullDataUrl, mime, base64Data) => {
    const uuid = `IMAGE_${getNanoid(12)}_IMAGE`;

    imageList.push({
      uuid,
      base64: base64Data,
      mime: `image/${mime}`
    });

    // 保持原有的 alt 文本，只替换 base64 部分
    return `![${altText}](${uuid})`;
  });

  return {
    text,
    imageList
  };
};
