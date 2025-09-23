import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import xlsx from 'node-xlsx';
import Papa from 'papaparse';

export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const result = xlsx.parse(buffer, {
    skipHidden: false,
    defval: ''
  });

  const format2Csv = result.map(({ name, data }) => {
    return {
      title: `#${name}`,
      csvText: data.map((item) => item.join(',')).join('\n')
    };
  });

  const rawText = format2Csv.map((item) => item.csvText).join('\n');

  const formatText = result
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
