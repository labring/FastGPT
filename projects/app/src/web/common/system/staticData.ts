import { getProRuntimeFeConfigs, getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';

import { useSystemStore } from './useSystemStore';

const getRuntimeFeConfigs = async (): Promise<
  Pick<FastGPTFeConfigsType, 'show_enterprise_auth'>
> => {
  try {
    const runtimeConfig = await getProRuntimeFeConfigs();

    return {
      show_enterprise_auth: !!runtimeConfig.feConfigs?.show_enterprise_auth
    };
  } catch {
    return {
      show_enterprise_auth: false
    };
  }
};

export const clientInitData = async (
  retry = 3
): Promise<{
  feConfigs: FastGPTFeConfigsType;
}> => {
  try {
    const res = await getSystemInitData(useSystemStore.getState().initDataBufferId);
    const feConfigs = {
      ...(res.feConfigs || useSystemStore.getState().feConfigs || {}),
      ...(await getRuntimeFeConfigs())
    };

    useSystemStore.getState().initStaticData({
      ...res,
      feConfigs
    });

    return {
      feConfigs
    };
  } catch (error) {
    if (retry > 0) {
      await delay(500);
      return clientInitData(retry - 1);
    }
    return Promise.reject(error);
  }
};
