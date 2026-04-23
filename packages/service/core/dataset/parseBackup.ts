import * as fs from 'fs';
import { addLog } from '../../common/system/log';
import { excelBufferToCSV } from '../../common/file/csv';
import { detectAndDecodeBuffer } from '../../common/file/encoding';
import { hashStr } from '@fastgpt/global/common/string/tools';

type ParseResult = {
  chunks: {
    q: string;
    a: string;
    indexes?: string[];
    imageIdList?: string[];
    metadata?: Map<string, string>;
  }[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const parseCsvFast = (
  require('csv-rex/parse') as {
    default: (text: string, opts: Record<string, unknown>) => string[][];
  }
).default;

/**
 * 将 CSV 格式的备份数据解析为 chunks
 * 支持元数据列：q,a 与 indexes 之间的列作为 metadata
 */
export const parseDatasetBackup2Chunks = (rawText: string, imageIdList?: string[]): ParseResult => {
  const csvArr = parseCsvFast(rawText, {
    header: false,
    errorOnEmptyLine: false,
    errorOnExtraFields: false,
    errorOnMissingFields: false,
    newlineChar: rawText.includes('\r\n') ? '\r\n' : '\n'
  });

  if (csvArr.length < 2) {
    return { chunks: [] };
  }
  var header = csvArr[0].map((h) => h.trim());
  // 查找indexes列的起始位置
  let indexesStartIndex = -1;
  for (let i = 0; i < header.length; i++) {
    if (header[i] == 'indexes') {
      indexesStartIndex = i;
      break;
    }
  }
  if (indexesStartIndex == 2) {
    const chunks = csvArr
      .slice(1)
      .map((item) => ({
        q: item[0] || '',
        a: item[1] || '',
        indexes: item.slice(2).filter((item) => item.trim()),
        imageIdList
      }))
      .filter((item) => item.q || item.a);
    return { chunks };
  } else {
    // 从q,a到indexes之间的列为元数据列
    const chunks = csvArr
      .slice(1)
      .map((item) => {
        const q = item[0] || '';
        const a = item[1] || '';

        const indexes = [];
        const metadata = new Map<string, string>();
        for (let i = 2; i < item.length; i++) {
          const value = item[i]?.trim();
          if (!value) continue;
          if (i >= indexesStartIndex) {
            // indexes及之后的列作为indexes
            indexes.push(value);
          } else {
            // 非q、a、indexes列作为metadata
            if (!header[i]) continue;
            metadata.set(header[i], value);
          }
        }
        return {
          q,
          a,
          indexes: indexes.length > 0 ? indexes : undefined,
          imageIdList,
          metadata: metadata.size > 0 ? metadata : undefined
        };
      })
      .filter((item) => item.q || item.a);
    return { chunks };
  }
};

/**
 * 从 SharedArrayBuffer 解析 CSV 数据
 * Worker 内部使用：主线程通过 SharedArrayBuffer 零拷贝传入二进制数据，
 * Worker 内转成字符串后调用 parseDatasetBackup2Chunks
 */
export const parseDatasetBackupFromSharedBuffer = (
  sharedBuffer: SharedArrayBuffer,
  bufferSize: number,
  imageIdList?: string[]
): ParseResult => {
  const uint8Array = new Uint8Array(sharedBuffer, 0, bufferSize);
  const rawText = Buffer.from(uint8Array).toString('utf-8');
  return parseDatasetBackup2Chunks(rawText, imageIdList);
};

/**
 * 快速统计 CSV 备份文件的有效行数（不构建 chunk 对象）
 * 用字节扫描替代 Papa.parse，避免 200k 对象分配，速度约为 Papa.parse 的 2.3 倍。
 * 主线程通过 Worker 调用，IPC 仅传回三个字段（chunkCount / hashRawText / rawTextLength），
 * 彻底消除结构化克隆大数组的开销。
 *
 * @internal Worker 内部使用
 */
const countCsvValidRows = (text: string): number => {
  let count = 0;
  let inQuote = false;
  let fieldIdx = 0;
  let fieldStart = 0;
  let firstLine = true;
  let hasQ = false;
  let hasA = false;

  const COMMA = 44;
  const LF = 10;
  const CR = 13;
  const DQUOTE = 34;

  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : LF; // 哨兵确保最后一行被处理

    if (c === DQUOTE) {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;

    if (c === COMMA) {
      if (!firstLine) {
        if (fieldIdx === 0) hasQ = i > fieldStart;
        else if (fieldIdx === 1) hasA = i > fieldStart;
      }
      fieldIdx++;
      fieldStart = i + 1;
    } else if (c === LF || (c === CR && i + 1 < text.length && text.charCodeAt(i + 1) === LF)) {
      if (!firstLine) {
        // 处理只有 q,a 两列（无逗号分隔 a）的情况
        if (fieldIdx === 1) hasA = i > fieldStart;
        if (hasQ || hasA) count++;
      }
      firstLine = false;
      fieldIdx = 0;
      fieldStart = i + 1;
      hasQ = false;
      hasA = false;
    }
  }

  return count;
};

/**
 * Worker 内部使用：从文件路径直接读取+解码，仅返回行数/哈希/长度，不构建 chunk 对象。
 * 对应生产入口：countDatasetBackupFromFileViaWorker
 *
 * 相比 parseDatasetBackupFromFile，消除了 Papa.parse 和 200k 对象构建，
 * IPC 负载从 ~200k 对象降为 3 个标量，主线程等待时间从 ~1600ms 降至 ~220ms。
 */
export const countDatasetBackupFromFile = (
  filePath: string,
  fileExtension: string
): { chunkCount: number; hashRawText: string; rawTextLength: number } => {
  const buffer = fs.readFileSync(filePath);

  let rawText: string;
  if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    rawText = excelBufferToCSV(buffer) || '';
    if (!rawText) {
      if (buffer.length > 500 * 1024) {
        throw new Error('template_excel_too_much_data');
      }
      throw new Error('template_excel_file_empty');
    }
  } else {
    rawText = detectAndDecodeBuffer(buffer).content;
  }

  return {
    chunkCount: countCsvValidRows(rawText),
    hashRawText: hashStr(rawText),
    rawTextLength: rawText.length
  };
};

/**
 * Worker 内部使用：从文件路径直接读取+解码+解析
 * 主线程只传 filePath 和 fileExtension，不接触大字符串，不阻塞事件循环
 */
export const parseDatasetBackupFromFile = (
  filePath: string,
  fileExtension: string,
  imageIdList?: string[]
): ParseResult & { hashRawText: string; rawTextLength: number } => {
  const buffer = fs.readFileSync(filePath);

  let rawText: string;
  if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    rawText = excelBufferToCSV(buffer) || '';
    // 保留原有校验：node-xlsx 对过大文件可能静默返回空
    if (!rawText) {
      if (buffer.length > 500 * 1024) {
        throw new Error('template_excel_too_much_data');
      }
      throw new Error('template_excel_file_empty');
    }
  } else {
    rawText = detectAndDecodeBuffer(buffer).content;
  }

  return {
    ...parseDatasetBackup2Chunks(rawText, imageIdList),
    hashRawText: hashStr(rawText),
    rawTextLength: rawText.length
  };
};
