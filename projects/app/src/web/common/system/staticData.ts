import type { InitDateResponse } from '@/global/common/api/systemRes';
import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type';
import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  ReRankModelItemType,
  VectorModelItemType,
  AudioSpeechModelType,
  WhisperModelType
} from '@fastgpt/global/core/ai/model.d';

export let feConfigs: FastGPTFeConfigsType = {};
export let systemVersion = '0.0.0';

export let chatModelList: ChatModelItemType[] = [];
export let vectorModelList: VectorModelItemType[] = [];
export let qaModelList: LLMModelItemType[] = [];
export let cqModelList: FunctionModelItemType[] = [];
export let qgModelList: LLMModelItemType[] = [];
export let extractModelList: FunctionModelItemType[] = [];
export let audioSpeechModelList: AudioSpeechModelType[] = [];
export let reRankModelList: ReRankModelItemType[] = [];
export let whisperModel: WhisperModelType;

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
    qgModelList = res.qgModes ?? qgModelList;

    audioSpeechModelList = res.audioSpeechModels ?? audioSpeechModelList;
    reRankModelList = res.reRankModels ?? reRankModelList;

    whisperModel = res.whisperModel;

    systemVersion = res.systemVersion;
    simpleModeTemplates = res.simpleModeTemplates;

    return res;
  } catch (error) {
    retryTimes--;
    await delay(500);
    return clientInitData();
  }
};
