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

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<GetSystemInitDataResponse> {
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
        aiproxyChannels: global.aiproxyChannelsCache
      };
    } catch {
      const referer = req.headers.referer;
      if (referer?.includes('/price')) {
        return {
          feConfigs: global.feConfigs,
          subPlans,
          aiproxyChannels: global.aiproxyChannelsCache
        };
      }

      const unAuthBufferId = global.systemInitBufferId ? `unAuth_${global.systemInitBufferId}` : '';
      if (bufferId && unAuthBufferId === bufferId) {
        return {
          bufferId: unAuthBufferId,
          aiproxyChannels: global.aiproxyChannelsCache
        };
      }

      return {
        bufferId: unAuthBufferId,
        feConfigs: global.feConfigs,
        aiproxyChannels: global.aiproxyChannelsCache
      };
    }
  })();

  return GetSystemInitDataResponseSchema.parse(response);
}

export default NextAPI(handler);
