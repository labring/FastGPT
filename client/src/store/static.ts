import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';
import type { InitDateResponse } from '@/pages/api/system/getInitData';
import { getInitData } from '@/api/system';
import { delay } from '@/utils/tools';

export let beianText = '';
export let googleVerKey = '';
export let baiduTongji = '';
export let chatModelList: ChatModelItemType[] = [];
export let qaModelList: QAModelItemType[] = [];
export let vectorModelList: VectorModelItemType[] = [];

let retryTimes = 3;

export const clientInitData = async (): Promise<InitDateResponse> => {
  try {
    const res = await getInitData();

    chatModelList = res.chatModels;
    qaModelList = res.qaModels;
    vectorModelList = res.vectorModels;
    beianText = res.beianText;
    googleVerKey = res.googleVerKey;
    baiduTongji = res.baiduTongji;

    return res;
  } catch (error) {
    retryTimes--;
    await delay(500);
    return clientInitData();
  }
};
