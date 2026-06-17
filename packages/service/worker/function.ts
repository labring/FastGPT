import {
  type SplitProps,
  type SplitResponse,
  splitText2Chunks
} from '@fastgpt/global/common/string/textSplitter';
import { runWorker, WorkerNameEnum } from './utils';
import type { ReadFileResponse } from './readFile/type';
import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { axios } from '../common/api/axios';

export const text2Chunks = async (props: SplitProps): Promise<SplitResponse> => {
  const { url: pdfParseUrl, key: token, chunkTimeout } = global.systemEnv?.customPdfParse ?? {};
  const url = pdfParseUrl?.replace(/\/pdfparse$/, '/chunk');

  if (!url) {
    if (isTestEnv) {
      return splitText2Chunks(props);
    }
    return runWorker<SplitResponse>(WorkerNameEnum.text2Chunks, props);
  }

  try {
    const res = await axios.post(url, {
      markdown: props.text,
      chunk_sizes: { text: props.chunkSize }
    }, {
      timeout: (chunkTimeout ?? 60) * 60 * 1000,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    const chunks: string[] = res.data.chunks.map((c: { text: string }) => c.text);
    const chars: number = chunks.reduce((sum, c) => sum + c.length, 0);

    return { chunks, chars };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Chunk API request failed: ${message}`);
  }
};

export const readRawContentFromBuffer = (props: {
  extension: string;
  encoding: string;
  buffer: Buffer;
}) => {
  const bufferSize = props.buffer.length;

  // 使用 SharedArrayBuffer，避免数据复制
  const sharedBuffer = new SharedArrayBuffer(bufferSize);
  const sharedArray = new Uint8Array(sharedBuffer);
  sharedArray.set(props.buffer);

  return runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
    extension: props.extension,
    encoding: props.encoding,
    sharedBuffer: sharedBuffer,
    bufferSize: bufferSize
  });
};

export const runSyncFunction = <T = any>(functionName: string, ...args: any[]) => {
  // Test env, not run worker
  if (isTestEnv) {
    // 在测试环境中直接导入并运行函数
    const { parseDatasetBackup2Chunks } = require('../core/dataset/parseBackup');
    const availableFunctions: Record<string, Function> = {
      parseDatasetBackup2Chunks
    };

    const func = availableFunctions[functionName];
    if (!func) {
      throw new Error(`Function '${functionName}' is not available`);
    }
    return func(...args);
  }

  return runWorker<T>(WorkerNameEnum.syncFunction, { functionName, args });
};

/**
 * 通过 Worker + SharedArrayBuffer 解析 CSV 备份数据
 * 主线程仅做内存拷贝（Buffer → SharedArrayBuffer），Papa.parse 在 Worker 子线程执行
 * 避免 50MB+ 大字符串的结构化克隆阻塞主线程
 */
export const parseDatasetBackupViaWorker = async (
  rawText: string,
  imageIdList?: string[]
): Promise<{
  chunks: {
    q: string;
    a: string;
    indexes?: string[];
    imageIdList?: string[];
    metadata?: Map<string, string>;
  }[];
}> => {
  if (isTestEnv) {
    const { parseDatasetBackup2Chunks } = require('../core/dataset/parseBackup');
    return parseDatasetBackup2Chunks(rawText, imageIdList);
  }

  const buffer = Buffer.from(rawText, 'utf-8');
  const bufferSize = buffer.length;

  // SharedArrayBuffer 零拷贝传递给 Worker，避免结构化克隆大字符串
  const sharedBuffer = new SharedArrayBuffer(bufferSize);
  const sharedArray = new Uint8Array(sharedBuffer);
  sharedArray.set(buffer);

  return runWorker(WorkerNameEnum.syncFunction, {
    functionName: 'parseDatasetBackupFromSharedBuffer',
    args: [sharedBuffer, bufferSize, imageIdList]
  });
};

/**
 * 通过 Worker 直接读文件并统计 CSV 备份行数（不构建 chunk 对象）
 * 主线程只传文件路径，Worker 内部读文件+解码+字节扫描计数，IPC 仅返回三个标量。
 * 用于替换 parseDatasetBackupFromFileViaWorker，彻底消除 200k 对象的 IPC 开销。
 */
export const countDatasetBackupFromFileViaWorker = async (
  filePath: string,
  fileExtension: string
): Promise<{ chunkCount: number; hashRawText: string; rawTextLength: number }> => {
  if (isTestEnv) {
    const { countDatasetBackupFromFile } = require('../core/dataset/parseBackup');
    return countDatasetBackupFromFile(filePath, fileExtension);
  }

  return runWorker(WorkerNameEnum.syncFunction, {
    functionName: 'countDatasetBackupFromFile',
    args: [filePath, fileExtension]
  });
};

/**
 * 通过 Worker 直接读文件并解析 CSV 备份数据
 * 主线程只传文件路径，Worker 内部读文件+解码+Papa.parse
 * 彻底避免主线程处理大字符串/大 Buffer，不阻塞事件循环
 */
export const parseDatasetBackupFromFileViaWorker = async (
  filePath: string,
  fileExtension: string,
  imageIdList?: string[]
): Promise<{
  chunks: {
    q: string;
    a: string;
    indexes?: string[];
    imageIdList?: string[];
    metadata?: Map<string, string>;
  }[];
  hashRawText: string;
  rawTextLength: number;
}> => {
  if (isTestEnv) {
    const { parseDatasetBackupFromFile } = require('../core/dataset/parseBackup');
    return parseDatasetBackupFromFile(filePath, fileExtension, imageIdList);
  }

  return runWorker(WorkerNameEnum.syncFunction, {
    functionName: 'parseDatasetBackupFromFile',
    args: [filePath, fileExtension, imageIdList]
  });
};
