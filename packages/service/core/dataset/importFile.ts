import path from 'path';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { readFileRawText } from '../../worker/readFile/extension/rawText';
import { parseDatasetCsvHeaders } from './read';

const supportedDatasetImportExtensions = new Set(['.csv', '.xlsx']);

/**
 * 将知识库模板或备份文件解析为标准 CSV 文本。
 * CSV 与 Excel 共用表头校验；Excel 仅允许单工作表且不能包含合并单元格，避免结构被静默改写。
 */
export const parseDatasetImportFile = async ({
  buffer,
  filename,
  encoding
}: {
  buffer: Buffer;
  filename: string;
  encoding: string;
}) => {
  const extension = path.extname(filename).toLowerCase();
  if (!supportedDatasetImportExtensions.has(extension)) {
    throw new Error('Unsupported dataset import file extension');
  }

  const rows = await (async () => {
    if (extension === '.csv') {
      const { rawText } = await readFileRawText({
        buffer,
        extension: 'csv',
        encoding
      });
      const result = Papa.parse<string[]>(rawText);
      if (result.errors.length > 0) {
        throw new Error('Invalid CSV content');
      }
      return result.data;
    }

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true
    });
    if (workbook.SheetNames.length !== 1) {
      throw new Error('Excel dataset import requires exactly one worksheet');
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet || (worksheet['!merges']?.length ?? 0) > 0) {
      throw new Error('Excel dataset import does not support merged cells');
    }

    return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false
    });
  })();

  const normalizedRows = rows.map((row) => row.map((cell) => String(cell ?? '')));
  const [headers = []] = normalizedRows;
  if (!parseDatasetCsvHeaders(headers).validTypedHeader) {
    throw new Error('Invalid dataset import headers');
  }

  return Papa.unparse(normalizedRows);
};
