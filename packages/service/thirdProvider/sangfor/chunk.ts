import { axiosWithoutSSRF } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE_PARSE);

type IultmzhChunkItem = { text: string };
type IultmzhChunkResponse = {
  chunks?: IultmzhChunkItem[];
  count?: number;
};

/**
 * 调用 sangfor 智能分块服务完成「文本→chunk」。服务契约:
 * POST JSON { markdown, chunk_sizes? } → 200 { chunks: [{ index, text, start_line, end_line, type }], count }
 * 鉴权为可选的 `Authorization: Bearer <key>`。平台只消费每个 chunk 的 text。
 *
 * 未配置地址时不静默回退本地分块,直接抛错,避免用户在不知情的情况下拿到低质量分块。
 */
export const chunkByIultmzh = async ({
  text,
  imageIdList,
  url,
  key,
  chunkSize,
  timeoutMs
}: {
  text: string;
  imageIdList?: string[];
  url?: string;
  key?: string;
  chunkSize: number;
  timeoutMs: number;
}): Promise<
  {
    q: string;
    a: string;
    indexes: string[];
    imageIdList?: string[];
  }[]
> => {
  if (!url) {
    throw DatasetErrEnum.externalChunkNotConfigured;
  }

  const markdown = (text || '').trim();
  if (!markdown) {
    return [];
  }

  const startedAt = Date.now();

  logger.info('Iultmzh chunking: routing text-to-chunk to external service', {
    url,
    textLength: markdown.length,
    chunkSize,
    timeoutMs,
    hasServiceKey: Boolean(key)
  });

  let data: IultmzhChunkResponse;
  try {
    const { data: res } = await axiosWithoutSSRF.post<IultmzhChunkResponse>(
      url,
      { markdown, chunk_sizes: { text: chunkSize } },
      {
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
        timeout: timeoutMs
      }
    );
    data = res;
  } catch (err) {
    logger.error('Iultmzh chunking request failed', {
      url,
      textLength: markdown.length,
      chunkSize,
      timeoutMs,
      durationMs: Date.now() - startedAt,
      error: getErrText(err)
    });
    throw DatasetErrEnum.externalChunkFailed;
  }

  if (!Array.isArray(data?.chunks)) {
    logger.error('Iultmzh chunking response invalid', {
      url,
      textLength: markdown.length,
      chunkSize,
      durationMs: Date.now() - startedAt,
      serviceCount: data?.count
    });
    throw DatasetErrEnum.externalChunkInvalidResponse;
  }

  const chunks: string[] = [];
  for (const item of data.chunks) {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string' || !item.text.trim()) {
      logger.error('Iultmzh chunking response invalid', {
        url,
        textLength: markdown.length,
        chunkSize,
        durationMs: Date.now() - startedAt,
        responseChunkCount: data.chunks.length,
        serviceCount: data.count
      });
      throw DatasetErrEnum.externalChunkInvalidResponse;
    }
    chunks.push(item.text);
  }

  // 平台只在文本足够长时才调用服务,返回 0 个分块视为异常,不静默产出空结果。
  if (chunks.length === 0) {
    logger.error('Iultmzh chunking response empty', {
      url,
      textLength: markdown.length,
      chunkSize,
      durationMs: Date.now() - startedAt,
      responseChunkCount: 0,
      serviceCount: data.count
    });
    throw DatasetErrEnum.externalChunkInvalidResponse;
  }

  logger.info('Iultmzh chunking request completed', {
    url,
    textLength: markdown.length,
    chunkSize,
    durationMs: Date.now() - startedAt,
    responseChunkCount: chunks.length,
    serviceCount: data.count
  });

  return chunks.map((item) => ({
    q: item,
    a: '',
    indexes: [],
    imageIdList
  }));
};
