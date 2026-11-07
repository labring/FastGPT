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
 * Excel 的“常规”格式会把超过 11 位的数字显示为科学计数法，SheetJS 格式化时也一样：
 * 8613812345678 这样的编号或手机号会变成 "8.61381E+12"，原始位数在表格和 CSV 中都丢失了。
 * 对常规格式且仍能被 JavaScript 精确表示的整数改为写出完整数值；用户显式设置的数字格式和
 * 已超出安全整数范围的值保持 SheetJS 原有文本，避免输出一个已经失真的数字。
 */
const keepWholeNumberDigits = (worksheet: XLSX.WorkSheet) => {
  for (const address of Object.keys(worksheet)) {
    if (address.startsWith('!')) continue;
    const cell = worksheet[address] as XLSX.CellObject;
    if (
      cell.t === 'n' &&
      cell.z === 'General' &&
      typeof cell.v === 'number' &&
      Number.isSafeInteger(cell.v) &&
      cell.w?.includes('E')
    ) {
      cell.w = String(cell.v);
    }
  }
};

/**
 * SheetJS 将默认短日期和日期时间写成有歧义的两位年份格式。
 * 按解析后的格式串匹配，因此采用相同格式串的自定义格式也统一处理。
 */
const ISO_FOR_LOCALE_DATE_FORMATS = new Map<string, string>([
  [XLSX.SSF.get_table()[14] as string, 'yyyy-mm-dd'],
  [XLSX.SSF.get_table()[22] as string, 'yyyy-mm-dd hh:mm']
]);

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
    // 保留 Excel 日期序列值；转成 Date 会丢失 1904 日期系统信息并引入本地时区转换。
    cellDates: false,
    // 保留格式串，用于识别默认日期格式和被“常规”格式改写为科学计数法的整数。
    cellNF: true,
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

  /**
   * 用原始日期序列值和工作簿日期系统生成无歧义的文本，避免 Date 往返导致日期或时间偏移。
   * 只覆盖目标格式数值单元格的显示文本；其他日期格式、纯时间和文本单元格保持原样。
   */
  const writeLocaleDatesAsIso = (worksheet: XLSX.WorkSheet) => {
    const formatOptions = { date1904: workbook.Workbook?.WBProps?.date1904 ?? false };

    for (const address of Object.keys(worksheet)) {
      if (address.startsWith('!')) continue;
      const cell = worksheet[address] as XLSX.CellObject;
      if (cell.t !== 'n' || typeof cell.v !== 'number' || typeof cell.z !== 'string') continue;

      const isoFormat = ISO_FOR_LOCALE_DATE_FORMATS.get(cell.z);
      if (isoFormat) {
        cell.w = XLSX.SSF.format(isoFormat, cell.v, formatOptions);
      }
    }
  };

  const result = worksheets.map(({ name, worksheet, merges, sheetRange }) => {
    keepWholeNumberDigits(worksheet);
    writeLocaleDatesAsIso(worksheet);
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
