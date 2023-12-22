import type { InitDateResponse } from '@/global/common/api/systemRes';
import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type';
import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  ReRankModelItemType,
  VectorModelItemType,
  AudioSpeechModelType
} from '@fastgpt/global/core/ai/model.d';

export let feConfigs: FeConfigsType = {};
export let priceMd = '';
export let systemVersion = '0.0.0';

export let chatModelList: ChatModelItemType[] = [];
export let vectorModelList: VectorModelItemType[] = [];
export let qaModelList: LLMModelItemType[] = [];
export let cqModelList: FunctionModelItemType[] = [];
export let extractModelList: FunctionModelItemType[] = [];
export let audioSpeechModels: AudioSpeechModelType[] = [];
export let reRankModelList: ReRankModelItemType[] = [];

export let simpleModeTemplates: AppSimpleEditConfigTemplateType[] = [];

let retryTimes = 3;

export const clientInitData = async (): Promise<InitDateResponse> => {
  try {
    const res = await getSystemInitData();
    feConfigs = res.feConfigs;

    chatModelList = res.chatModels ?? chatModelList;
    vectorModelList = res.vectorModels ?? vectorModelList;

    qaModelList = res.qaModels ?? qaModelList;
    cqModelList = res.cqModels ?? cqModelList;
    extractModelList = res.extractModels ?? extractModelList;

    audioSpeechModels = res.audioSpeechModels ?? audioSpeechModels;
    reRankModelList = res.reRankModels ?? reRankModelList;

    priceMd = res.priceMd;
    systemVersion = res.systemVersion;
    simpleModeTemplates = res.simpleModeTemplates;

    return res;
  } catch (error) {
    retryTimes--;
    await delay(500);
    return clientInitData();
  }
};
