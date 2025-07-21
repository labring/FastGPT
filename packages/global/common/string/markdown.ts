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
      // 清理多余的空白字符和换行符
      const cleanHtml = htmlTable.replace(/\n\s*/g, '');
      const rows = cleanHtml.match(/<tr>(.*?)<\/tr>/g);
      if (!rows) return htmlTable;

      // Parse table data
      // 解析表格数据
      let tableData: string[][] = [];
      let maxColumns = 0;

      // Try to convert to markdown table
      // 尝试将 HTML 表格转换为 markdown 表格
      rows.forEach((row, rowIndex) => {
        if (!tableData[rowIndex]) {
          tableData[rowIndex] = [];
        }
        let colIndex = 0;
        // 匹配所有单元格，包括自闭合的 <td/> 标签和普通的 <td>...</td> 标签
        const cells = row.match(/<td[^>]*\/>|<td[^>]*>.*?<\/td>/g) || [];

        cells.forEach((cell) => {
          // 跳过已被占用的列
          while (tableData[rowIndex][colIndex]) {
            colIndex++;
          }
          // 获取 colspan 和 rowspan 属性，默认为 1
          const colspan = parseInt(cell.match(/colspan="(\d+)"/)?.[1] || '1');
          const rowspan = parseInt(cell.match(/rowspan="(\d+)"/)?.[1] || '1');

          // 提取单元格内容，处理自闭合标签和普通标签
          let content = '';
          if (cell.endsWith('/>')) {
            // 自闭合标签，内容为空
            content = '';
          } else {
            // 普通标签，提取内容
            content = cell.replace(/<td[^>]*>|<\/td>/g, '').trim();
          }

          // 根据 rowspan 和 colspan 填充表格数据
          for (let i = 0; i < rowspan; i++) {
            for (let j = 0; j < colspan; j++) {
              if (!tableData[rowIndex + i]) {
                tableData[rowIndex + i] = [];
              }
              // 只有左上角填内容，其余合并单元格填 ^^ 占位
              tableData[rowIndex + i][colIndex + j] = i === 0 && j === 0 ? content : '^^';
            }
          }
          colIndex += colspan;
          maxColumns = Math.max(maxColumns, colIndex);
        });

        // 补齐每一行的列数
        for (let i = 0; i < maxColumns; i++) {
          if (!tableData[rowIndex][i]) {
            tableData[rowIndex][i] = ' ';
          }
        }
      });
      const chunks: string[] = [];

      // 构建表头
      const headerCells = tableData[0]
        .slice(0, maxColumns)
        .map((cell) => (cell === '^^' ? ' ' : cell || ' '));
      const headerRow = '| ' + headerCells.join(' | ') + ' |';
      chunks.push(headerRow);

      // 构建分隔行
      const separator = '| ' + Array(headerCells.length).fill('---').join(' | ') + ' |';
      chunks.push(separator);

      // 构建数据行
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
      // 如果解析失败，返回原始 HTML 表格
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
  const base64Regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64[^)]+)\)/g;
  const imageList: ImageType[] = [];

  text = text.replace(base64Regex, (match, altText, base64Url) => {
    const uuid = `IMAGE_${getNanoid(12)}_IMAGE`;
    const mime = base64Url.split(';')[0].split(':')[1];
    const base64 = base64Url.split(',')[1];

    imageList.push({
      uuid,
      base64,
      mime
    });

    // 保持原有的 alt 文本，只替换 base64 部分
    return `![${altText}](${uuid})`;
  });

  return {
    text,
    imageList
  };
};
