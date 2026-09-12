import { axiosWithoutSSRF } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getErrText } from '@fastgpt/global/common/error/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE_PARSE);

type ExternalChunkItem = { text: string };
type ExternalChunkResponse = {
  chunks?: ExternalChunkItem[];
  count?: number;
};

/**
 * 调用自研「智能分块」服务完成「文本→chunk」。服务契约:
 * POST JSON { markdown, chunk_sizes? } → 200 { chunks: [{ index, text, start_line, end_line, type }], count }
 * 鉴权为可选的 `Authorization: Bearer <key>`。平台只消费每个 chunk 的 text。
 */
export const splitByExternalChunkService = async ({
  text,
  url,
  key,
  chunkSize,
  timeoutMs
}: {
  text: string;
  url: string;
  key?: string;
  chunkSize: number;
  timeoutMs: number;
}): Promise<string[]> => {
  const markdown = (text || '').trim();
  if (!markdown) {
    return [];
  }

  const startedAt = Date.now();
  logger.info('External chunking request started', {
    url,
    textLength: markdown.length,
    chunkSize,
    timeoutMs,
    hasKey: Boolean(key)
  });

  let data: ExternalChunkResponse;
  try {
    const { data: res } = await axiosWithoutSSRF.post<ExternalChunkResponse>(
      url,
      { markdown, chunk_sizes: { text: chunkSize } },
      {
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
        timeout: timeoutMs
      }
    );
    data = res;
  } catch (err) {
    logger.error('External chunking request failed', {
      url,
      textLength: markdown.length,
      chunkSize,
      timeoutMs,
      durationMs: Date.now() - startedAt,
      error: getErrText(err)
    });
    throw new Error(`智能分块服务调用失败：${getErrText(err)}`);
  }

  if (!Array.isArray(data?.chunks)) {
    logger.error('External chunking response invalid', {
      url,
      textLength: markdown.length,
      chunkSize,
      durationMs: Date.now() - startedAt,
      responseChunkCount: undefined,
      serviceCount: data?.count
    });
    throw new Error('智能分块服务返回格式异常');
  }

  const chunks: string[] = [];
  for (const item of data.chunks) {
    if (!item || typeof item !== 'object' || typeof item.text !== 'string' || !item.text.trim()) {
      logger.error('External chunking response invalid', {
        url,
        textLength: markdown.length,
        chunkSize,
        durationMs: Date.now() - startedAt,
        responseChunkCount: data.chunks.length,
        serviceCount: data.count
      });
      throw new Error('智能分块服务返回格式异常');
    }
    chunks.push(item.text);
  }

  // 平台只在文本足够长时才调用服务,返回 0 个分块视为异常,不静默产出空结果。
  if (chunks.length === 0) {
    logger.error('External chunking response empty', {
      url,
      textLength: markdown.length,
      chunkSize,
      durationMs: Date.now() - startedAt,
      responseChunkCount: 0,
      serviceCount: data.count
    });
    throw new Error('智能分块服务未返回有效分块');
  }

  logger.info('External chunking request completed', {
    url,
    textLength: markdown.length,
    chunkSize,
    durationMs: Date.now() - startedAt,
    responseChunkCount: chunks.length,
    serviceCount: data.count
  });

  return chunks;
};
