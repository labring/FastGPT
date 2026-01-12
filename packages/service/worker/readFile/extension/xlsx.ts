import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import xlsx from 'node-xlsx';
import Papa from 'papaparse';

// 判断行是否为空行（所有单元格都是空字符串或只包含空白字符）
const isEmptyRow = (row: any[]): boolean => {
  return row.every((cell) => {
    const cellStr = String(cell).trim();
    return cellStr === '';
  });
};

export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const result = xlsx.parse(buffer, {
    skipHidden: false,
    defval: ''
  });

  // 过滤掉空行
  const filteredResult = result.map(({ name, data }) => ({
    name,
    data: data.filter((row) => !isEmptyRow(row))
  }));

  const format2Csv = filteredResult.map(({ name, data }) => {
    return {
      title: `#${name}`,
      csvText: data.map((item) => item.join(',')).join('\n')
    };
  });

  const rawText = format2Csv.map((item) => item.csvText).join('\n');

  const formatText = filteredResult
    .map(({ data }) => {
      const header = data[0];
      if (!header) return;

      const formatText = `| ${header.join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${data
  .slice(1)
  .map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, '\\n')).join(' | ')} |`)
  .join('\n')}`;

      return formatText;
    })
    .filter(Boolean)
    .join(CUSTOM_SPLIT_SIGN);

  return {
    rawText: rawText,
    formatText
  };
};

