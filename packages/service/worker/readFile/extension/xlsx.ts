import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import XLSX from 'xlsx';
import { filterEmptyTableData, formatMarkdownTableRow } from './utils';

export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true
  });

  const result = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false
    });

    const merges = worksheet['!merges'] ?? [];
    const sheetRange = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : undefined;
    const startRow = sheetRange?.s.r ?? 0;
    const startColumn = sheetRange?.s.c ?? 0;

    if (merges.length > 0) {
      // 合并单元格只有左上角存值；!merges 使用 Excel 绝对坐标，
      // 但 sheet_to_json 生成的二维数组从 !ref 起点开始，所以填充前要扣掉起始偏移。
      // 必须先补齐合并区域，再做空行空列过滤，否则会丢失用户在 Excel 中表达的结构语义。
      for (const merge of merges) {
        const startDataRow = merge.s.r - startRow;
        const startDataColumn = merge.s.c - startColumn;
        const endDataRow = merge.e.r - startRow;
        const endDataColumn = merge.e.c - startColumn;

        const value = data[startDataRow]?.[startDataColumn] ?? '';
        if (String(value).trim() === '') continue;

        for (let rowIndex = startDataRow; rowIndex <= endDataRow; rowIndex++) {
          if (rowIndex < 0) continue;
          data[rowIndex] ??= [];

          for (let columnIndex = startDataColumn; columnIndex <= endDataColumn; columnIndex++) {
            if (columnIndex < 0) continue;
            data[rowIndex][columnIndex] = value;
          }
        }
      }
    }

    return {
      name,
      data
    };
  });

  const filteredResult = result.map(({ name, data }) => ({
    name,
    data: filterEmptyTableData(data)
  }));

  const format2Csv = result.map(({ name, data }) => {
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

      const formatText = `${formatMarkdownTableRow(header)}
| ${header.map(() => '---').join(' | ')} |
${data.slice(1).map(formatMarkdownTableRow).join('\n')}`;

      return formatText;
    })
    .filter(Boolean)
    .join(CUSTOM_SPLIT_SIGN);

  return {
    rawText: rawText,
    formatText
  };
};
