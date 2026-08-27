import {
  ChunkTriggerConfigTypeEnum,
  DatasetSourceReadTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { urlsFetch } from '../../common/string/cheerio';
import { type TextSplitProps } from '../../common/string/textSplitter';
import { axios } from '../../common/api/axios';
import { readFileContentByBuffer } from '../../common/file/read/utils';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { getApiDatasetRequest } from './apiDataset';
import Papa from 'papaparse';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { text2Chunks } from '../../worker/function';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getFileMaxSize } from '../../common/file/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import { getS3DatasetSource } from '../../common/s3/sources/dataset';
import { getFileS3Key, isS3ObjectKey } from '../../common/s3/utils';
import { isAuthorizedDatasetFileS3Key } from '../../common/s3/sources/dataset/key';
import { getLogger, LogCategories } from '../../common/logger';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getBackendFileOperationTimeoutMs } from '../../common/file/parseTimeout';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

const datasetCsvColumnTypes = new Set(['q', 'a', 'index', 'indexes', 'metadata']);

/**
 * 解析知识库 CSV 表头，支持新版 q/a/index/metadata 和旧版 q/a/indexes 结构。
 * q、a 必须各出现一次，metadata 最多一列，index/indexes 可以重复。
 */
export const parseDatasetCsvHeaders = (headers: string[]) => {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const typedHeader =
    normalized.length > 0 && normalized.every((header) => datasetCsvColumnTypes.has(header));

  return {
    normalized,
    typedHeader,
    validTypedHeader:
      typedHeader &&
      normalized.filter((header) => header === 'q').length === 1 &&
      normalized.filter((header) => header === 'a').length === 1 &&
      normalized.filter((header) => header === 'metadata').length <= 1
  };
};

/**
 * 从 CSV 原文读取第一行表头，统一复用 PapaParse，避免 API 层用字符串 split 误判带引号的表头。
 */
export const getDatasetCsvHeaders = (rawText: string) => {
  const [headers = []] = Papa.parse(rawText).data as string[][];
  return headers;
};

export const readFileRawTextByUrl = async ({
  teamId,
  tmbId,
  url,
  customPdfParse,
  getFormatText,
  relatedId,
  datasetId,
  usageId,
  maxFileSize = getFileMaxSize()
}: {
  teamId: string;
  tmbId: string;
  url: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  relatedId: string; // externalFileId / apiFileId
  datasetId: string;
  usageId?: string;
  maxFileSize?: number;
}) => {
  const extension = parseFileExtensionFromUrl(url);
  const downloadTimeoutMs = getBackendFileOperationTimeoutMs();
  const downloadDeadline = Date.now() + downloadTimeoutMs;
  const getRemainingDownloadMs = () => Math.max(0, downloadDeadline - Date.now());
  const getDownloadRequestTimeout = (maxTimeoutMs: number) => {
    const remainingMs = getRemainingDownloadMs();
    if (remainingMs <= 0) {
      throw new Error(`File download timeout after ${downloadTimeoutMs / 1000} seconds`);
    }
    return Math.min(maxTimeoutMs, remainingMs);
  };

  // Check file size
  try {
    const headResponse = await axios.head(url, { timeout: getDownloadRequestTimeout(10000) });
    const contentLength = parseInt(
      getAxiosHeaderValue(headResponse.headers['content-length']) || '0'
    );

    if (contentLength > 0 && contentLength > maxFileSize) {
      return Promise.reject(
        `File too large. Size: ${Math.round(contentLength / 1024 / 1024)}MB, Maximum allowed: ${Math.round(maxFileSize / 1024 / 1024)}MB`
      );
    }
  } catch (error) {
    if (getRemainingDownloadMs() <= 0) throw error;
    logger.warn('File HEAD request failed, skip size precheck', { url, error });
  }

  // Use stream response type, avoid double memory usage
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    maxContentLength: maxFileSize,
    timeout: getDownloadRequestTimeout(30000)
  });

  // 优化：直接从 stream 转换为 buffer，避免 arraybuffer 中间步骤
  const chunks: Buffer[] = [];
  let totalLength = 0;

  return new Promise<{ rawText: string }>((resolve, reject) => {
    let isAborted = false;

    const cleanup = () => {
      if (!isAborted) {
        isAborted = true;
        chunks.length = 0; // 清理内存
        response.data.destroy();
      }
    };

    // Stream timeout
    const streamTimeoutMs = getRemainingDownloadMs();
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`File download timeout after ${downloadTimeoutMs / 1000} seconds`));
    }, streamTimeoutMs);

    response.data.on('data', (chunk: Buffer) => {
      if (isAborted) return;
      totalLength += chunk.length;
      if (totalLength > maxFileSize) {
        clearTimeout(timeoutId);
        cleanup();
        return reject(
          `File too large. Maximum size allowed is ${Math.round(maxFileSize / 1024 / 1024)}MB.`
        );
      }

      chunks.push(chunk);
    });

    response.data.on('end', async () => {
      if (isAborted) return;

      clearTimeout(timeoutId);

      try {
        if (getRemainingDownloadMs() <= 0) {
          throw new Error(`File download timeout after ${downloadTimeoutMs / 1000} seconds`);
        }

        // 合并所有 chunks 为单个 buffer
        const buffer = Buffer.concat(chunks as unknown as Uint8Array[]);

        // 立即清理 chunks 数组释放内存
        chunks.length = 0;

        const { fileParsedPrefix } = getFileS3Key.dataset({
          datasetId,
          filename: 'file'
        });
        const { rawText } = await retryFn(() => {
          return readFileContentByBuffer({
            customPdfParse,
            usageId,
            getFormatText,
            extension,
            teamId,
            tmbId,
            buffer,
            encoding: 'utf-8',
            imageKeyOptions: {
              // TODO: 链接解析出来的图片不过期，删除知识库时候也需要一起删
              prefix: fileParsedPrefix
            }
          });
        });

        if (getRemainingDownloadMs() <= 0) {
          throw new Error(`File download timeout after ${downloadTimeoutMs / 1000} seconds`);
        }

        resolve({ rawText });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    response.data.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      cleanup();
      reject(error);
    });

    response.data.on('close', () => {
      clearTimeout(timeoutId);
      cleanup();
    });
  });
};

/*
  fileId - local file, read from mongo
  link - request
  externalFile/apiFile = request read
*/
export const readDatasetSourceRawText = async ({
  teamId,
  tmbId,
  type,
  sourceId,
  selector,
  externalFileId,
  apiDatasetServer,
  customPdfParse,
  getFormatText,
  usageId,
  datasetId
}: {
  teamId: string;
  tmbId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;

  selector?: string; // link selector
  externalFileId?: string; // external file dataset
  apiDatasetServer?: ApiDatasetServerType; // api dataset
  usageId?: string;
  datasetId: string; // For S3 image upload
}): Promise<{
  title?: string;
  rawText: string;
}> => {
  if (type === DatasetSourceReadTypeEnum.fileLocal) {
    if (!datasetId || !isS3ObjectKey(sourceId, 'dataset')) {
      return Promise.reject('datasetId is required for S3 files');
    }

    if (!isAuthorizedDatasetFileS3Key({ key: sourceId, datasetId })) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
    }

    const { filename, rawText } = await getS3DatasetSource().getDatasetFileRawText({
      teamId,
      tmbId,
      fileId: sourceId,
      getFormatText,
      customPdfParse,
      usageId,
      datasetId
    });

    return {
      title: filename,
      rawText
    };
  } else if (type === DatasetSourceReadTypeEnum.link) {
    const result = await urlsFetch({
      urlList: [sourceId],
      selector
    });

    const { title = sourceId, content = '' } = result[0];
    if (!content || content === 'Cannot fetch internal url') {
      return Promise.reject(content || 'Can not fetch content from link');
    }

    return {
      title,
      rawText: content
    };
  } else if (type === DatasetSourceReadTypeEnum.externalFile) {
    if (!externalFileId) return Promise.reject(new UserError('FileId not found'));
    const { rawText } = await readFileRawTextByUrl({
      teamId,
      tmbId,
      url: sourceId,
      relatedId: externalFileId,
      datasetId,
      customPdfParse,
      usageId
    });
    return {
      rawText
    };
  } else if (type === DatasetSourceReadTypeEnum.apiFile) {
    const { title, rawText } = await readApiServerFileContent({
      apiDatasetServer,
      apiFileId: sourceId,
      teamId,
      tmbId,
      customPdfParse,
      datasetId,
      usageId
    });
    return {
      title,
      rawText
    };
  }
  return {
    title: '',
    rawText: ''
  };
};

export const readApiServerFileContent = async ({
  apiDatasetServer,
  apiFileId,
  teamId,
  tmbId,
  customPdfParse,
  datasetId,
  usageId
}: {
  apiDatasetServer?: ApiDatasetServerType;
  apiFileId: string;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  datasetId: string;
  usageId?: string;
}): Promise<{
  title?: string;
  rawText: string;
}> => {
  return (await getApiDatasetRequest(apiDatasetServer)).getFileContent({
    teamId,
    tmbId,
    apiFileId,
    customPdfParse,
    datasetId,
    usageId
  });
};

export const rawText2Chunks = async ({
  rawText = '',
  chunkTriggerType = ChunkTriggerConfigTypeEnum.minSize,
  chunkTriggerMinSize = 1000,
  backupParse,
  chunkSize = 512,
  imageIdList,
  ...splitProps
}: {
  rawText: string;
  imageIdList?: string[];

  chunkTriggerType?: ChunkTriggerConfigTypeEnum;
  chunkTriggerMinSize?: number; // maxSize from agent model, not store

  backupParse?: boolean;
  tableParse?: boolean;
} & TextSplitProps): Promise<
  {
    q: string;
    a: string;
    indexes?: string[];
    metadata?: Record<string, any>;
    imageIdList?: string[];
  }[]
> => {
  const parseDatasetBackup2Chunks = (rawText: string) => {
    const csvArr = Papa.parse<string[]>(rawText, {
      // 空记录不会生成知识库 chunk；解析时提前跳过，避免短 CSV 的尾部空行干扰分隔符推断。
      skipEmptyLines: 'greedy'
    }).data;
    if (csvArr.length < 2) return { chunks: [] };

    const rawHeaders = csvArr[0];
    const { normalized: headers, typedHeader } = parseDatasetCsvHeaders(rawHeaders);

    // Build column index mapping
    let qIdx = -1,
      aIdx = -1;
    const indexesIdxs: number[] = [];
    const metadataKeys: { idx: number; key: string }[] = [];
    const metadataIdxs: number[] = [];

    headers.forEach((header, idx) => {
      if (header === 'q') {
        qIdx = idx;
      } else if (header === 'a') {
        aIdx = idx;
      } else if (header === 'index' || header === 'indexes') {
        indexesIdxs.push(idx);
      } else if (typedHeader && header === 'metadata') {
        metadataIdxs.push(idx);
      } else {
        metadataKeys.push({ idx, key: rawHeaders[idx].trim() });
      }
    });

    // 旧导出格式只有一个 indexes 表头，但数据行会把多个索引展开到后续单元格。
    const legacyIndexesStart =
      metadataKeys.length === 0 && metadataIdxs.length === 0 && indexesIdxs.length === 1
        ? indexesIdxs[0]
        : undefined;

    const chunks = csvArr
      .slice(1)
      .map((item) => {
        const q = qIdx >= 0 ? item[qIdx] || '' : '';
        const a = aIdx >= 0 ? item[aIdx] || '' : '';

        const indexes = (
          legacyIndexesStart !== undefined
            ? item.slice(legacyIndexesStart)
            : indexesIdxs.map((idx) => item[idx])
        )
          .map((value) => (value || '').trim())
          .filter(Boolean);

        // Build metadata: only include non-empty values
        let metadata: Record<string, any> | undefined;
        for (const { idx, key } of metadataKeys) {
          const val = (item[idx] || '').trim();
          if (val) {
            metadata = metadata || {};
            metadata[key] = val;
          }
        }

        for (const idx of metadataIdxs) {
          const val = (item[idx] || '').trim();
          if (!val) continue;

          let parsedValue: Record<string, any> | undefined;
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              parsedValue = parsed;
            }
          } catch {}

          metadata = metadata || {};
          if (parsedValue) {
            Object.assign(metadata, parsedValue);
          } else {
            // 固定 metadata 表头没有字段名，非法 JSON 仍按列序保留，避免静默丢值。
            metadata[`metadata_${idx}`] = val;
          }
        }

        return { q, a, indexes, metadata, imageIdList };
      })
      .filter((item) => item.q || item.a);

    return { chunks };
  };

  if (backupParse) {
    return parseDatasetBackup2Chunks(rawText).chunks;
  }

  // Chunk condition
  // 1. 选择最大值条件，只有超过了最大值(默认为模型的最大值*0.7），才会触发分块
  if (chunkTriggerType === ChunkTriggerConfigTypeEnum.maxSize) {
    const textLength = rawText.trim().length;
    const maxSize = splitProps.maxSize ? splitProps.maxSize * 0.7 : 16000;
    if (textLength < maxSize) {
      return [
        {
          q: rawText,
          a: '',
          imageIdList
        }
      ];
    }
  }
  // 2. 选择最小值条件，只有超过最小值(手动决定)才会触发分块
  if (chunkTriggerType !== ChunkTriggerConfigTypeEnum.forceChunk) {
    const textLength = rawText.trim().length;
    if (textLength < chunkTriggerMinSize) {
      return [{ q: rawText, a: '', imageIdList }];
    }
  }

  const { chunks } = await text2Chunks({
    text: rawText,
    chunkSize,
    ...splitProps
  });

  return chunks.map((item) => ({
    q: item,
    a: '',
    indexes: [],
    imageIdList
  }));
};
