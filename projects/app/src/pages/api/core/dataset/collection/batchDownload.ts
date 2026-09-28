import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { BatchDownloadDatasetCollectionsQuerySchema } from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { serviceEnv } from '@fastgpt/service/env';
import {
  streamDatasetArchiveResponse,
  withDatasetArchiveResources
} from '@/service/core/dataset/collection/archive';
import { consumeDatasetArchiveTicket } from '@/service/core/dataset/collection/archiveTicket';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { createS3ProxyAbortContext } from '@/service/common/s3/proxy';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  // 仅允许本站页面承载下载 iframe，以便在 ZIP 响应开始前读取统一 JSON 错误。
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const { ticket } = parseApiInput({
    req,
    querySchema: BatchDownloadDatasetCollectionsQuerySchema
  }).query;
  const { teamId, tmbId } = await parseHeaderCert({
    req,
    authToken: true,
    authApiKey: true
  });
  const abortContext = createS3ProxyAbortContext({ req, res });
  let ticketConsumed = false;

  try {
    await withDatasetArchiveResources({
      tmbId: String(tmbId),
      concurrency: serviceEnv.DATASET_ARCHIVE_MAX_CONCURRENCY,
      waitForSlot: true,
      fn: async ({ signals, assertValid }) => {
        const signal = AbortSignal.any([abortContext.signal, ...signals]);
        signal.throwIfAborted();
        assertValid();

        const ticketPayload = await consumeDatasetArchiveTicket({
          tmbId: String(tmbId),
          ticket
        });
        if (!ticketPayload || ticketPayload.teamId !== String(teamId)) {
          throw DatasetErrEnum.archiveInvalidTicket;
        }
        ticketConsumed = true;

        signal.throwIfAborted();
        assertValid();
        signal.throwIfAborted();

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          getContentDisposition({
            filename: `collections-${Date.now()}.zip`,
            type: 'attachment'
          })
        );
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Referrer-Policy', 'no-referrer');

        await streamDatasetArchiveResponse({
          res,
          manifest: ticketPayload.manifest,
          signal,
          assertLeaseValid: assertValid
        });
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      // 已设置 ZIP 头但尚未写正文时，恢复 NextAPI 的 JSON 错误响应语义。
      [
        'Content-Type',
        'Content-Disposition',
        'Cache-Control',
        'X-Accel-Buffering',
        'Referrer-Policy'
      ].forEach((header) => res.removeHeader(header));
      if (ticketConsumed && error === DatasetErrEnum.archiveUnavailable) {
        throw DatasetErrEnum.archiveInvalidTicket;
      }
      throw error;
    }

    logger.error('Dataset archive stream failed after response started', { error });
    if (!res.destroyed) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    abortContext.cleanup();
  }
}

export default NextAPI(handler, {
  // 浏览器原生 GET 下载无法携带 CSRF Header；短效、成员绑定且一次性消费的 Ticket 即下载凭证。
  csrf: false,
  redactQueryParams: ['ticket']
});

export const config = {
  api: {
    responseLimit: false
  }
};
