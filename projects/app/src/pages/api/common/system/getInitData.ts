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

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<GetSystemInitDataResponse> {
  const { bufferId } = parseApiInput({
    req,
    querySchema: GetSystemInitDataQuerySchema
  }).query;

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
        subPlans: global.subPlans,
        systemVersion: global.systemVersion,
        activeModelList: global.systemActiveDesensitizedModels,
        defaultModels: global.systemDefaultModel,
        modelProviders: global.ModelProviderRawCache,
        aiproxyChannels: global.aiproxyChannelsCache
      };
    } catch {
      const referer = req.headers.referer;
      if (referer?.includes('/price')) {
        return {
          feConfigs: global.feConfigs,
          subPlans: global.subPlans,
          modelProviders: global.ModelProviderRawCache,
          aiproxyChannels: global.aiproxyChannelsCache,
          activeModelList: global.systemActiveDesensitizedModels
        };
      }

      const unAuthBufferId = global.systemInitBufferId ? `unAuth_${global.systemInitBufferId}` : '';
      if (bufferId && unAuthBufferId === bufferId) {
        return {
          bufferId: unAuthBufferId,
          modelProviders: global.ModelProviderRawCache,
          aiproxyChannels: global.aiproxyChannelsCache
        };
      }

      return {
        bufferId: unAuthBufferId,
        feConfigs: global.feConfigs,
        modelProviders: global.ModelProviderRawCache,
        aiproxyChannels: global.aiproxyChannelsCache
      };
    }
  })();

  return GetSystemInitDataResponseSchema.parse(response);
}

export default NextAPI(handler);
