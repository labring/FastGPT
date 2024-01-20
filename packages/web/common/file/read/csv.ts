import Papa from 'papaparse';
import { readFileRawText } from './rawText';

/**
 * read csv to json
 * @response {
 *  header: string[],
 *  data: string[][]
 * }
 */
export const readCsvContent = async ({ file }: { file: File }) => {
  try {
    const { rawText: textArr } = await readFileRawText(file);
    const csvArr = Papa.parse(textArr).data as string[][];
    if (csvArr.length === 0) {
      throw new Error('csv 解析失败');
    }

    const header = csvArr.shift() as string[];

    // add title to data
    const rawText = csvArr
      .map((item) =>
        item.map((value, index) => {
          if (!header[index]) return value;
          return `${header[index]}: ${value}`;
        })
      )
      .flat()
      .join('\n');

    return {
      rawText,
      header,
      data: csvArr.map((item) => item)
    };
  } catch (error) {
    return Promise.reject('解析 csv 文件失败');
  }
};
