import Papa from 'papaparse';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { readFileRawText } from './rawText';

// 加载源文件内容
export const readCsvRawText = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const { rawText } = await readFileRawText(params);

  const csvArr = Papa.parse(rawText).data as string[][];

  // 检查是否有数据
  if (!csvArr || csvArr.length === 0) {
    return {
      rawText,
      formatText: ''
    };
  }

  const header = csvArr[0];

  // 检查表头是否有效
  if (!header || header.length === 0) {
    return {
      rawText,
      formatText: ''
    };
  }

  // 格式化单元格内容：处理换行符和特殊字符，避免破坏 Markdown 表格结构
  const formatCell = (text: string): string => {
    return text
      .replace(/\r?\n/g, ' ')  // 将换行符替换为空格
      .replace(/\|/g, '\\|')    // 转义竖线字符，避免破坏表格结构
      .replace(/\s+/g, ' ')     // 将多个空格合并为一个
      .trim();                   // 去除首尾空格
  };

  const formatText = `| ${header.map(formatCell).join(' | ')} |
| ${header.map(() => '---').join(' | ')} |
${csvArr
  .slice(1)
  .map((row) => `| ${row.map(formatCell).join(' | ')} |`)
  .join('\n')}`;

  return {
    rawText,
    formatText
  };
};

