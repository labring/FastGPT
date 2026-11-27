import path from 'path';
import Papa from 'papaparse';
import { readFileContentBySource } from '../../common/file/read/utils';
import { parseDatasetCsvHeaders, readDatasetXlsxTable, type DatasetImportTable } from './read';
import type { FileSource } from '../../common/file/read/source';

const supportedDatasetImportExtensions = new Set(['.csv', '.xlsx']);

/**
 * 校验知识库模板或备份。CSV 保留标准文本，XLSX 单表直接映射成知识块。
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
}): Promise<
  | { rawText: string; importedTable?: never }
  | { rawText?: never; importedTable: DatasetImportTable }
> => {
  const extension = path.extname(filename).toLowerCase();
  if (!supportedDatasetImportExtensions.has(extension)) {
    throw new Error('Unsupported dataset import file extension');
  }

  if (extension === '.xlsx') {
    return { importedTable: await readDatasetXlsxTable(source) };
  }

  const { rawText } = await readFileContentBySource({
    teamId,
    tmbId,
    source,
    getFormatText: false,
    // 导入需要内置解析返回 CSV 原文。
    forceSystemParse: true
  });

  const { data: rows, errors } = Papa.parse<string[]>(rawText, {
    // 导出方（exportAll.ts / collection/export.ts）在空数据集或单条数据时会生成
    // 只有表头（或仅一行）的 CSV。此时 papaparse 无法从多行数据推断分隔符，会抛出
    // Delimiter/UndetectableDelimiter 的提示性错误，但数据本身并未损坏。
    // 这里用 skipEmptyLines 规避该提示，同时保留 Quotes 等真实结构错误的拒绝行为。
    skipEmptyLines: 'greedy'
  });
  if (errors.length > 0) {
    throw new Error('Invalid dataset import content');
  }
  const [headers = []] = rows;
  if (!parseDatasetCsvHeaders(headers).validTypedHeader) {
    throw new Error('Invalid dataset import headers');
  }

  return { rawText: Papa.unparse(rows) };
};
