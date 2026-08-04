import path from 'path';
import Papa from 'papaparse';
import { readRawTextByLocalFile } from '../../common/file/read/utils';
import { parseDatasetCsvHeaders } from './read';

const supportedDatasetImportExtensions = new Set(['.csv', '.xlsx']);

/**
 * 将知识库模板或备份文件解析为标准 CSV 文本。
 * CSV 与 Excel 共用表头校验；Excel 仅允许单工作表且不能包含合并单元格，避免结构被静默改写。
 */
export const parseDatasetImportFile = async ({
  teamId,
  tmbId,
  filePath,
  filename,
  encoding
}: {
  teamId: string;
  tmbId: string;
  filePath: string;
  filename: string;
  encoding: string;
}) => {
  const extension = path.extname(filename).toLowerCase();
  if (!supportedDatasetImportExtensions.has(extension)) {
    throw new Error('Unsupported dataset import file extension');
  }

  const { rawText, tableInfo } = await readRawTextByLocalFile({
    teamId,
    tmbId,
    path: filePath,
    encoding,
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

  const result = Papa.parse<string[]>(rawText);
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
