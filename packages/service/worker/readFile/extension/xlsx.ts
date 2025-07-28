import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import xlsx from 'node-xlsx';
import Papa from 'papaparse';
import { addLog } from '../../../common/system/log';

export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const result = xlsx.parse(buffer, {
    skipHidden: false,
    defval: ''
  });

  // Clean newline characters in data to prevent errors in subsequent markdown parsing
  const cleanedResult = result.map(({ name, data }) => ({
    name,
    data: data.map((row) =>
      row.map((cell) => (typeof cell === 'string' ? cell.replace(/[\n\r]/g, ' ') : cell))
    )
  }));

  const format2Csv = cleanedResult.map(({ name, data }) => {
    return {
      title: `#${name}`,
      csvText: data.map((item) => item.join(',')).join('\n')
    };
  });

  const rawText = format2Csv.map((item) => item.csvText).join('\n');

  const formatText = format2Csv
    .map((item) => {
      const csvArr = Papa.parse(item.csvText).data as string[][];
      const header = csvArr[0];

      if (!header) return;

      const formatText = `| ${header.join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${csvArr
  .slice(1)
  .map((row) => `| ${row.join(' | ')} |`)
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
