import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';

import { useSystemStore } from './useSystemStore';

let retryTimes = 3;

export const clientInitData = async (): Promise<{
  feConfigs: FastGPTFeConfigsType;
}> => {
  try {
    const res = await getSystemInitData();
    useSystemStore.getState().initStaticData(res);

    return {
      feConfigs
    };
  } catch (error) {
    retryTimes--;
    await delay(500);
    return clientInitData();
  }
};
