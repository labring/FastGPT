import Papa from 'papaparse';
import { ReadRawTextByBuffer, ReadFileResponse } from '../type';
import { readFileRawText } from './rawText';

// 加载源文件内容
export const readCsvRawText = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { rawText } = readFileRawText(params);

  const csvArr = Papa.parse(rawText).data as string[][];

  const header = csvArr[0];

  const formatText = header
    ? csvArr.map((item) => item.map((item, i) => `${header[i]}:${item}`).join('\n')).join('\n')
    : '';

  return {
    rawText,
    formatText
  };
};
