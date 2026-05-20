import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';

import { useSystemStore } from './useSystemStore';

export const clientInitData = async (
  retry = 3,
  options?: { forceRefresh?: boolean }
): Promise<{ feConfigs: FastGPTFeConfigsType }> => {
  try {
    const bufferId = options?.forceRefresh ? undefined : useSystemStore.getState().initDataBufferId;
    const res = await getSystemInitData(bufferId);
    useSystemStore.getState().initStaticData(res);

    return {
      feConfigs: res.feConfigs || useSystemStore.getState().feConfigs || {}
    };
  } catch (error) {
    if (retry > 0) {
      await delay(500);
      return clientInitData(retry - 1, options);
    }
    return Promise.reject(error);
  }
};
