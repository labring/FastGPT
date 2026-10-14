import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type {
  GetSystemInitDataQuery,
  GetSystemInitDataResponse
} from '@fastgpt/global/openapi/common/system/api';

import { useSystemStore } from './useSystemStore';

/** 初始化公开配置，调用方可显式补取套餐；重试保留资源请求参数和当前缓存标识。 */
export const clientInitData = async ({
  retry = 3,
  includeSubPlans
}: Pick<GetSystemInitDataQuery, 'includeSubPlans'> & { retry?: number } = {}): Promise<{
  feConfigs: NonNullable<GetSystemInitDataResponse['feConfigs']>;
}> => {
  try {
    const res = await getSystemInitData({
      bufferId: useSystemStore.getState().initDataBufferId,
      ...(includeSubPlans && { includeSubPlans })
    });
    useSystemStore.getState().initStaticData(res);

    return {
      feConfigs: res.feConfigs || useSystemStore.getState().feConfigs || {}
    };
  } catch (error) {
    if (retry > 0) {
      await delay(500);
      return clientInitData({ retry: retry - 1, includeSubPlans });
    }
    return Promise.reject(error);
  }
};
