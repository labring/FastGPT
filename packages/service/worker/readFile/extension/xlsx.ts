import { CUSTOM_SPLIT_SIGN } from '@fastgpt/global/common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import xlsx from 'node-xlsx';
import Papa from 'papaparse';
import { addLog } from '../../../common/system/log';

export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  // result 是一个对象数组，每个对象有 name 和 data 属性
  // name 是表格的名称（工作表名）
  // data 是一个二维数组，每个子数组代表表格中的一行
  // 每个子数组的元素是字符串，表示该行的每个单元格内容
  const result = xlsx.parse(buffer, {
    skipHidden: false,
    defval: ''
  });

  addLog.info('result:', result);

  // 清理data中的换行符，防止后续markdown解析出错
  const cleanedResult = result.map(({ name, data }) => ({
    name,
    data: data.map((row) =>
      row.map((cell) =>
        typeof cell === 'string' ? cell.replace(/\n/g, ' ').replace(/\r/g, ' ') : cell
      )
    )
  }));

  // format2Csv 是 format2Csv 的数组，每个元素是一个对象，有 title 和 csvText 属性
  // title 是表格的名称（工作表名）
  // csvText 是表格的文本，每个元素是一个字符串，表示该行的每个单元格内容
  // 每个单元格内容是 csvText 的每个元素，每个元素是一个字符串，表示该行的每个单元格内容
  const format2Csv = cleanedResult.map(({ name, data }) => {
    return {
      title: `#${name}`,
      csvText: data.map((item) => item.join(',')).join('\n')
    };
  });
  // formatText 是 markdown 格式的表格文本
  // 它将表格转换为 markdown 格式，并添加表格标题和分隔线
  // 表格标题是 #${name}，表示表格的名称
  // 表格分隔线是 | --- | ，表示表格的列分隔线
  // 表格内容是 csvText 的每一行，每一行是一个表格行
  // 每个表格行是一个 markdown 表格行，每个单元格内容是 csvText 的每个元素，每个元素是一个字符串，表示该行的每个单元格内容
  // 每个单元格内容是 csvText 的每个元素，每个元素是一个字符串，表示该行的每个单元格内容
  const rawText = format2Csv.map((item) => item.csvText).join('\n');
  // addLog.info('rawText', {rawText});
  const formatText = format2Csv
    .map((item) => {
      const csvArr = Papa.parse(item.csvText).data as string[][];
      const header = csvArr[0];

      if (!header) return;

      const formatText = `| ${header.join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${csvArr
  .slice(1)
  .map(
    (row) =>
      `| ${row.map((item) => String(item).replace(/\n/g, ' ').replace(/\r/g, ' ')).join(' | ')} |`
  )
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
