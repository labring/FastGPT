import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import { getSystemInitData } from '@/web/common/api/system';
import { delay } from '@/utils/tools';
import type { FeConfigsType } from '@fastgpt/common/type/index.d';

export let chatModelList: ChatModelItemType[] = [];
export let qaModel: QAModelItemType = {
  model: 'gpt-3.5-turbo-16k',
  name: 'GPT35-16k',
  maxToken: 16000,
  price: 0
};
export let vectorModelList: VectorModelItemType[] = [];
export let feConfigs: FeConfigsType = {};
export let priceMd = '';
export let systemVersion = '0.0.0';

let retryTimes = 3;

export const clientInitData = async (): Promise<InitDateResponse> => {
  try {
    const res = await getSystemInitData();

    chatModelList = res.chatModels;
    qaModel = res.qaModel;
    vectorModelList = res.vectorModels;
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
