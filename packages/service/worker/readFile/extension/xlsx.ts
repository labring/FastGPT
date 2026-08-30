import { CUSTOM_SPLIT_SIGN } from '../../../common/string/textSplitter';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { filterEmptyTableData, formatMarkdownTableRow } from './utils';
import { workerEnv } from '../../env';
import { estimateFileParseMemoryBytes } from '../../fileParseResource';
import { preflightXlsx } from './xlsxPreflight';

/**
 * XLSX 结构安全预算。行列与单元格限制可按业务规模调整。
 */
export const XLSX_PARSE_LIMITS = {
  maxRows: workerEnv.XLSX_PARSE_MAX_ROWS,
  maxColumns: workerEnv.XLSX_PARSE_MAX_COLUMNS,
  maxCells: workerEnv.XLSX_PARSE_MAX_CELLS,
  maxMergedCells: workerEnv.XLSX_PARSE_MAX_MERGED_CELLS
} as const;

/**
 * 使用调度器对同一 XLSX 输入的内存估算限制解压总量，保留 ZIP 炸弹防护且不引入固定 worker 额度。
 */
export const getXlsxParseLimits = (fileSizeBytes: number) => ({
  ...XLSX_PARSE_LIMITS,
  maxUncompressedBytes: estimateFileParseMemoryBytes({
    extension: 'xlsx',
    fileSizeBytes
  })
});

/**
 * 将 XLSX 转换为 CSV 原文和 Markdown 表格。
 *
 * 工作簿会在生成二维数组和回填合并单元格前完成范围校验；任何工作表范围、
 * 工作簿总单元格数或合并回填量超出配置预算时都会直接报错。
 */
export const readXlsxRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const parseLimits = getXlsxParseLimits(buffer.length);
  await preflightXlsx({
    buffer,
    limits: parseLimits
  });

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    // 预检已验证真实坐标；这里继续截断，避免后续依赖升级意外绕过纵深保护。
    sheetRows: XLSX_PARSE_LIMITS.maxRows
  });

  /**
   * 拒绝无效坐标，避免减法、乘法或循环边界被非有限值绕过。
   */
  const isValidCoordinate = (value: number) => Number.isSafeInteger(value) && value >= 0;

  let workbookCellCount = 0;
  let workbookMergedCellCount = 0;

  const worksheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const merges = worksheet['!merges'] ?? [];
    const fullSheetRef = worksheet['!fullref'] ?? worksheet['!ref'];
    const sheetRange = fullSheetRef ? XLSX.utils.decode_range(fullSheetRef) : undefined;

    if (
      sheetRange &&
      (!isValidCoordinate(sheetRange.s.r) ||
        !isValidCoordinate(sheetRange.s.c) ||
        !isValidCoordinate(sheetRange.e.r) ||
        !isValidCoordinate(sheetRange.e.c) ||
        sheetRange.s.r > sheetRange.e.r ||
        sheetRange.s.c > sheetRange.e.c)
    ) {
      throw new Error(`XLSX worksheet "${name}" has an invalid range`);
    }

    if (sheetRange) {
      const rowCount = sheetRange.e.r + 1;
      const columnCount = sheetRange.e.c + 1;
      const sheetCellCount =
        (sheetRange.e.r - sheetRange.s.r + 1) * (sheetRange.e.c - sheetRange.s.c + 1);

      if (rowCount > XLSX_PARSE_LIMITS.maxRows) {
        throw new Error(
          `XLSX worksheet "${name}" exceeds the maximum row limit of ${XLSX_PARSE_LIMITS.maxRows}`
        );
      }
      if (columnCount > XLSX_PARSE_LIMITS.maxColumns) {
        throw new Error(
          `XLSX worksheet "${name}" exceeds the maximum column limit of ${XLSX_PARSE_LIMITS.maxColumns}`
        );
      }

      workbookCellCount += sheetCellCount;
      if (workbookCellCount > XLSX_PARSE_LIMITS.maxCells) {
        throw new Error(
          `XLSX workbook exceeds the maximum cell limit of ${XLSX_PARSE_LIMITS.maxCells}`
        );
      }
    }

    for (const merge of merges) {
      if (
        !sheetRange ||
        !isValidCoordinate(merge.s.r) ||
        !isValidCoordinate(merge.s.c) ||
        !isValidCoordinate(merge.e.r) ||
        !isValidCoordinate(merge.e.c) ||
        merge.s.r > merge.e.r ||
        merge.s.c > merge.e.c ||
        merge.s.r < sheetRange.s.r ||
        merge.s.c < sheetRange.s.c ||
        merge.e.r > sheetRange.e.r ||
        merge.e.c > sheetRange.e.c
      ) {
        throw new Error(`XLSX worksheet "${name}" has a merge range outside worksheet bounds`);
      }

      workbookMergedCellCount += (merge.e.r - merge.s.r + 1) * (merge.e.c - merge.s.c + 1);
      if (workbookMergedCellCount > XLSX_PARSE_LIMITS.maxMergedCells) {
        throw new Error(
          `XLSX workbook exceeds the maximum merged-cell fill limit of ${XLSX_PARSE_LIMITS.maxMergedCells}`
        );
      }
    }

    return {
      name,
      worksheet,
      merges,
      sheetRange
    };
  });

  const result = worksheets.map(({ name, worksheet, merges, sheetRange }) => {
    const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false
    });

    const startRow = sheetRange?.s.r ?? 0;
    const startColumn = sheetRange?.s.c ?? 0;

    if (merges.length > 0) {
      // 合并单元格只有左上角存值；!merges 使用 Excel 绝对坐标，
      // 但 sheet_to_json 生成的二维数组从 !ref 起点开始，所以填充前要扣掉起始偏移。
      // 必须先补齐合并区域，再做空行空列过滤，否则会丢失用户在 Excel 中表达的结构语义。
      for (const merge of merges) {
        const startDataRow = merge.s.r - startRow;
        const startDataColumn = merge.s.c - startColumn;
        const endDataRow = merge.e.r - startRow;
        const endDataColumn = merge.e.c - startColumn;

        const value = data[startDataRow]?.[startDataColumn] ?? '';
        if (String(value).trim() === '') continue;

        for (let rowIndex = startDataRow; rowIndex <= endDataRow; rowIndex++) {
          if (rowIndex < 0) continue;
          data[rowIndex] ??= [];

          for (let columnIndex = startDataColumn; columnIndex <= endDataColumn; columnIndex++) {
            if (columnIndex < 0) continue;
            data[rowIndex][columnIndex] = value;
          }
        }
      }
    }

    return {
      name,
      data,
      mergedCellCount: merges.length
    };
  });

  const filteredResult = result.map(({ name, data }) => ({
    name,
    data: filterEmptyTableData(data)
  }));

  const format2Csv = result.map(({ name, data }) => {
    return {
      title: `#${name}`,
      csvText: Papa.unparse(data)
    };
  });

  const rawText = format2Csv.map((item) => item.csvText).join('\n');

  const formatText = filteredResult
    .map(({ data }) => {
      const header = data[0];
      if (!header) return;

      const formatText = `${formatMarkdownTableRow(header)}
| ${header.map(() => '---').join(' | ')} |
${data.slice(1).map(formatMarkdownTableRow).join('\n')}`;

      return formatText;
    })
    .filter(Boolean)
    .join(CUSTOM_SPLIT_SIGN);

  return {
    rawText: rawText,
    formatText,
    tableInfo: {
      sheetCount: result.length,
      mergedCellCount: result.reduce((count, item) => count + item.mergedCellCount, 0)
    }
  };
};
