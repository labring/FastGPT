import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';
import type { InitDateResponse } from '@/pages/api/system/getInitData';
import { getInitData } from '@/api/system';
import { delay } from '@/utils/tools';
import { FeConfigsType } from '@/types';

export let chatModelList: ChatModelItemType[] = [];
export let qaModelList: QAModelItemType[] = [];
export let vectorModelList: VectorModelItemType[] = [];
export let feConfigs: FeConfigsType = {};

let retryTimes = 3;

export const clientInitData = async (): Promise<InitDateResponse> => {
  try {
    const res = await getInitData();

    chatModelList = res.chatModels;
    qaModelList = res.qaModels;
    vectorModelList = res.vectorModels;
    feConfigs = res.feConfigs;

    return res;
  } catch (error) {
    retryTimes--;
    await delay(500);
    return clientInitData();
  }
};
