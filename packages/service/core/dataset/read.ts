import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import {
  ChunkTriggerConfigTypeEnum,
  DatasetSourceReadTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { readFileContentFromMongo } from '../../common/file/gridfs/controller';
import { urlsFetch } from '../../common/string/cheerio';
import { type TextSplitProps } from '@fastgpt/global/common/string/textSplitter';
import axios from 'axios';
import { readRawContentByFileBuffer } from '../../common/file/read/utils';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { getApiDatasetRequest } from './apiDataset';
import Papa from 'papaparse';
import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { text2Chunks } from '../../worker/function';
import { addLog } from '../../common/system/log';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { getFileMaxSize } from '../../common/file/utils';
import { UserError } from '@fastgpt/global/common/error/utils';

export const readFileRawTextByUrl = async ({
  teamId,
  tmbId,
  url,
  customPdfParse,
  getFormatText,
  relatedId,
  maxFileSize = getFileMaxSize()
}: {
  teamId: string;
  tmbId: string;
  url: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  relatedId: string; // externalFileId / apiFileId
  maxFileSize?: number;
}) => {
  const extension = parseFileExtensionFromUrl(url);

  // Check file size
  try {
    const headResponse = await axios.head(url, { timeout: 10000 });
    const contentLength = parseInt(headResponse.headers['content-length'] || '0');

    if (contentLength > 0 && contentLength > maxFileSize) {
      return Promise.reject(
        `File too large. Size: ${Math.round(contentLength / 1024 / 1024)}MB, Maximum allowed: ${Math.round(maxFileSize / 1024 / 1024)}MB`
      );
    }
  } catch (error) {
    addLog.warn('Check file HEAD request failed');
  }

  // Use stream response type, avoid double memory usage
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    maxContentLength: maxFileSize,
    timeout: 30000
  });

  // 优化：直接从 stream 转换为 buffer，避免 arraybuffer 中间步骤
  const chunks: Buffer[] = [];
  let totalLength = 0;

  return new Promise<string>((resolve, reject) => {
    let isAborted = false;

    const cleanup = () => {
      if (!isAborted) {
        isAborted = true;
        chunks.length = 0; // 清理内存
        response.data.destroy();
      }
    };

    // Stream timeout
    const timeoutId = setTimeout(() => {
      cleanup();
      reject('File download timeout after 30 seconds');
    }, 600000);

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
        // 合并所有 chunks 为单个 buffer
        const buffer = Buffer.concat(chunks);

        // 立即清理 chunks 数组释放内存
        chunks.length = 0;

        const { rawText } = await retryFn(() =>
          readRawContentByFileBuffer({
            customPdfParse,
            getFormatText,
            extension,
            teamId,
            tmbId,
            buffer,
            encoding: 'utf-8',
            metadata: {
              relatedId
            }
          })
        );

        resolve(rawText);
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
  getFormatText
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
}): Promise<{
  title?: string;
  rawText: string;
}> => {
  if (type === DatasetSourceReadTypeEnum.fileLocal) {
    const { filename, rawText } = await readFileContentFromMongo({
      teamId,
      tmbId,
      bucketName: BucketNameEnum.dataset,
      fileId: sourceId,
      customPdfParse,
      getFormatText
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
    const rawText = await readFileRawTextByUrl({
      teamId,
      tmbId,
      url: sourceId,
      relatedId: externalFileId,
      customPdfParse
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
      customPdfParse
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
  customPdfParse
}: {
  apiDatasetServer?: ApiDatasetServerType;
  apiFileId: string;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
}): Promise<{
  title?: string;
  rawText: string;
}> => {
  return (await getApiDatasetRequest(apiDatasetServer)).getFileContent({
    teamId,
    tmbId,
    apiFileId,
    customPdfParse
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
    imageIdList?: string[];
  }[]
> => {
  const parseDatasetBackup2Chunks = (rawText: string) => {
    const csvArr = Papa.parse(rawText).data as string[][];

    const chunks = csvArr
      .slice(1)
      .map((item) => ({
        q: item[0] || '',
        a: item[1] || '',
        indexes: item.slice(2).filter((item) => item.trim()),
        imageIdList
      }))
      .filter((item) => item.q || item.a);

    return {
      chunks
    };
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
