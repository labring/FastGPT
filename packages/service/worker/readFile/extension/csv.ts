import Papa from 'papaparse';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { readFileRawText } from './rawText';
import { filterEmptyTableData, formatMarkdownTableRow } from './utils';

// 加载源文件内容
export const readCsvRawText = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { rawText } = await readFileRawText(params);

  const csvArr = Papa.parse(rawText).data as string[][];

  const filteredData = filterEmptyTableData(csvArr);
  const header = filteredData[0];
  if (!header) {
    return {
      rawText,
      formatText: ''
    };
  }

  // format to md table
  const formatText = `${formatMarkdownTableRow(header)}
| ${header.map(() => '---').join(' | ')} |
${filteredData.slice(1).map(formatMarkdownTableRow).join('\n')}`;

  return {
    rawText,
    formatText
  };
};
