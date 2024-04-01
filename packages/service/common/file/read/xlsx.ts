import { ReadFileByBufferParams, ReadFileResponse } from './type.d';
import xlsx from 'node-xlsx';
import Papa from 'papaparse';

export const readXlsxRawText = async ({
  buffer
}: ReadFileByBufferParams): Promise<ReadFileResponse> => {
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
  const formatText = format2Csv
    .map((item) => {
      const csvArr = Papa.parse(item.csvText).data as string[][];
      const header = csvArr[0];

      const formatText = header
        ? csvArr
            .map((item) =>
              item
                .map((item, i) => (item ? `${header[i]}:${item}` : ''))
                .filter(Boolean)
                .join('\n')
            )
            .join('\n')
        : '';

      return `${item.title}\n${formatText}`;
    })
    .join('\n');

  return {
    rawText: rawText,
    formatText
  };
};
