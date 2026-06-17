import type { NextApiRequest, NextApiResponse } from 'next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import {
  ApiRequestInputParseError,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';
import { exchangePluginDebugTicket } from '@fastgpt/service/thirdProvider/fastgptPlugin/debugSession';
import {
  ExchangePluginDebugTicketQuerySchema,
  PluginDebugSessionExchangeResultSchema
} from '@fastgpt/global/openapi/core/plugin/debug/api';

const logger = getLogger(LogCategories.MODULE.PLUGIN.DEBUG);

/**
 * CLI 使用的一次性 ticket 兑换入口。
 * 这里不复用 NextAPI，避免默认 HTTP 日志把 query 中的 ticket 写入普通业务日志。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const start = Date.now();

  try {
    await withNextCors(req, res);

    logger.info(`[${req.method || 'GET'}] /api/plugin/debug/connect`);

    const {
      query: { ticket }
    } = parseApiInput({
      req,
      querySchema: ExchangePluginDebugTicketQuerySchema
    });
    const result = await exchangePluginDebugTicket({ ticket });

    logger.info(
      `[${req.method || 'GET'}] /api/plugin/debug/connect - 200 in ${Date.now() - start}ms`
    );

    return res.status(200).json(PluginDebugSessionExchangeResultSchema.parse(result));
  } catch (error) {
    const code = error instanceof ApiRequestInputParseError ? 400 : 500;
    logger.warn(
      `[${req.method || 'GET'}] /api/plugin/debug/connect - ${code} in ${Date.now() - start}ms`
    );

    return res.status(code).json({
      message: code === 400 ? 'Data validation error' : 'Debug connect failed'
    });
  }
}
