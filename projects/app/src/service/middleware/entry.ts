import { withNextCors } from '@fastgpt/next/middle/cors';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { createApiEntry } from '@fastgpt/service/common/http/entry';
import { serviceEnv } from '@fastgpt/service/env';
import { ensureModelCatalogReady } from '@fastgpt/service/core/ai/config/runtime';

export const NextAPI = createApiEntry<NextApiRequest, NextApiResponse>({
  beforeCallback: [
    async (req) => {
      if (req.method === 'OPTIONS') return;
      // 模型消费相关入口才校验目录版本；登录、健康检查和配置修复入口不受坏模型阻塞。
      const pathname = (req.url ?? '').split('?')[0];
      if (
        /\/api\/(?:core\/(?:ai|app|chat|dataset|workflow)(?:\/|$)|v1\/|support\/audio\/)/.test(
          pathname
        )
      ) {
        await ensureModelCatalogReady();
      }
    },
    (req, res) =>
      withNextCors({
        req,
        res,
        allowedOrigins: serviceEnv.ALLOWED_ORIGINS?.split(',')
      })
  ]
});
