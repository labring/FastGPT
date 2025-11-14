import Papa from 'papaparse';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { readFileRawText } from './rawText';

// 加载源文件内容
export const readCsvRawText = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { rawText } = await readFileRawText(params);

  const csvArr = Papa.parse(rawText).data as string[][];

  const header = csvArr[0];

  // format to md table
  const formatText = `| ${header.join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${csvArr
  .slice(1)
  .map((row) => `| ${row.map((item) => item.replace(/\n/g, '\\n')).join(' | ')} |`)
  .join('\n')}`;

  return {
    rawText,
    formatText
  };
};
