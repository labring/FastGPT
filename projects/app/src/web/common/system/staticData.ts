import type { InitDateResponse } from '@/global/common/api/systemRes';
import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@/utils/tools';
import type { FeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import {
  defaultChatModels,
  defaultQAModels,
  defaultCQModels,
  defaultExtractModels,
  defaultQGModels,
  defaultVectorModels
} from '@fastgpt/global/core/ai/model';

export let feConfigs: FeConfigsType = {};
export let priceMd = '';
export let systemVersion = '0.0.0';

export let vectorModelList = defaultVectorModels;
export let chatModelList = defaultChatModels;
export let qaModelList = defaultQAModels;
export let cqModelList = defaultCQModels;
export let extractModelList = defaultExtractModels;
export let qgModelList = defaultQGModels;

let retryTimes = 3;

export const clientInitData = async (): Promise<InitDateResponse> => {
  try {
    const res = await getSystemInitData();

    chatModelList = res.chatModels || [];
    qaModelList = res.qaModels || [];
    cqModelList = res.cqModels || [];
    extractModelList = res.extractModels || [];
    qgModelList = res.qgModels || [];

    vectorModelList = res.vectorModels || [];

    feConfigs = res.feConfigs;
    priceMd = res.priceMd;
    systemVersion = res.systemVersion;

    return res;
  } catch (error) {
    retryTimes--;
    await delay(500);
    return clientInitData();
  }
};
