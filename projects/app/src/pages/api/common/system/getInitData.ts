import { getModelProviderMetadata } from '@fastgpt/service/core/app/provider/controller';
import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetSystemInitDataQuerySchema,
  GetSystemInitDataResponseSchema,
  type GetSystemInitDataResponse
} from '@fastgpt/global/openapi/common/system/api';
import { getRuntimeSubPlansConfig } from '@fastgpt/global/support/wallet/sub/utils';
import { refreshMaxServerStatus } from '@fastgpt/service/common/system/maxServer';
import { serviceEnv } from '@fastgpt/service/env';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<GetSystemInitDataResponse> {
  // 动态感知 Max 服务可用性（内置 30s/5s TTL 缓存，零额外开销），自动规避并发启动时序差
  if (serviceEnv.MAX_URL) {
    const prevHasMax = global.hasMax;
    const currentHasMax = await refreshMaxServerStatus();
    if (prevHasMax !== currentHasMax) {
      global.systemInitBufferId = `${Date.now()}`;
    }
  }

  const { bufferId } = parseApiInput({
    req,
    querySchema: GetSystemInitDataQuerySchema
  }).query;
  const subPlans = getRuntimeSubPlansConfig(global.subPlans);

  const response = await (async () => {
    try {
      await authCert({ req, authToken: true });

      // If bufferId is the same as the current bufferId, return directly
      if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
        return {
          bufferId: global.systemInitBufferId,
          feConfigs: global.feConfigs,
          systemVersion: global.systemVersion
        };
      }

      return {
        bufferId: global.systemInitBufferId,
        feConfigs: global.feConfigs,
        subPlans,
        systemVersion: global.systemVersion,
        aiproxyChannels: getModelProviderMetadata().aiproxyChannels
      };
    } catch {
      const referer = req.headers.referer;
      if (referer?.includes('/price')) {
        return {
          feConfigs: global.feConfigs,
          subPlans,
          aiproxyChannels: getModelProviderMetadata().aiproxyChannels
        };
      }

      const unAuthBufferId = global.systemInitBufferId ? `unAuth_${global.systemInitBufferId}` : '';
      if (bufferId && unAuthBufferId === bufferId) {
        return {
          bufferId: unAuthBufferId,
          aiproxyChannels: getModelProviderMetadata().aiproxyChannels
        };
      }

      return {
        bufferId: unAuthBufferId,
        feConfigs: global.feConfigs,
        aiproxyChannels: getModelProviderMetadata().aiproxyChannels
      };
    }
  })();

  return GetSystemInitDataResponseSchema.parse(response);
}

export default NextAPI(handler);
