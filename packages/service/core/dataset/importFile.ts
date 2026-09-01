import path from 'path';
import Papa from 'papaparse';
import { readFileContentBySource } from '../../common/file/read/utils';
import { parseDatasetCsvHeaders } from './read';
import type { FileSource } from '../../common/file/read/source';

const supportedDatasetImportExtensions = new Set(['.csv', '.xlsx']);

/**
 * 将知识库模板或备份文件解析为标准 CSV 文本。
 * CSV 与 Excel 共用表头校验；Excel 仅允许单工作表且不能包含合并单元格，避免结构被静默改写。
 */
export const parseDatasetImportFile = async ({
  teamId,
  tmbId,
  source,
  filename
}: {
  teamId: string;
  tmbId: string;
  source: FileSource;
  filename: string;
}) => {
  const extension = path.extname(filename).toLowerCase();
  if (!supportedDatasetImportExtensions.has(extension)) {
    throw new Error('Unsupported dataset import file extension');
  }

  const { rawText, tableInfo } = await readFileContentBySource({
    teamId,
    tmbId,
    source,
    getFormatText: false
  });

  if (extension === '.xlsx') {
    if (tableInfo?.sheetCount !== 1) {
      throw new Error('Excel dataset import requires exactly one worksheet');
    }
    if (tableInfo.mergedCellCount > 0) {
      throw new Error('Excel dataset import does not support merged cells');
    }
  }

  const result = Papa.parse<string[]>(rawText, {
    // 导出方（exportAll.ts / collection/export.ts）在空数据集或单条数据时会生成
    // 只有表头（或仅一行）的 CSV。此时 papaparse 无法从多行数据推断分隔符，会抛出
    // Delimiter/UndetectableDelimiter 的提示性错误，但数据本身并未损坏。
    // 这里用 skipEmptyLines 规避该提示，同时保留 Quotes 等真实结构错误的拒绝行为。
    skipEmptyLines: 'greedy'
  });
  if (result.errors.length > 0) {
    throw new Error('Invalid dataset import content');
  }
  const rows = result.data;

  const normalizedRows = rows.map((row) => row.map((cell) => String(cell ?? '')));
  const [headers = []] = normalizedRows;
  if (!parseDatasetCsvHeaders(headers).validTypedHeader) {
    throw new Error('Invalid dataset import headers');
  }

  return Papa.unparse(normalizedRows);
};
