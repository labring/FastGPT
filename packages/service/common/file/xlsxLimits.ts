import { workerEnv } from '../../worker/env';
import { estimateFileParseMemoryBytes } from '../../worker/fileParseResource';

/** XLSX 结构安全预算，供主线程和 Worker 共用，避免引用具体解析实现。 */
export const XLSX_PARSE_LIMITS = {
  maxRows: workerEnv.XLSX_PARSE_MAX_ROWS,
  maxColumns: workerEnv.XLSX_PARSE_MAX_COLUMNS,
  maxCells: workerEnv.XLSX_PARSE_MAX_CELLS,
  maxMergedCells: workerEnv.XLSX_PARSE_MAX_MERGED_CELLS
} as const;

/** 使用调度器对同一 XLSX 输入的内存估算限制解压总量，保留 ZIP 炸弹防护。 */
export const getXlsxParseLimits = (fileSizeBytes: number) => ({
  ...XLSX_PARSE_LIMITS,
  maxUncompressedBytes: estimateFileParseMemoryBytes({
    extension: 'xlsx',
    fileSizeBytes
  })
});
