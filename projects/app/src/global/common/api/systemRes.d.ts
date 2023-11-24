import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels,
  WhisperModelType
} from '@fastgpt/global/core/ai/model.d';

import type { FeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type';

export type ConfigFileType = {
  FeConfig: FeConfigsType;
  SystemParams: SystemEnvType;
  ChatModels: ChatModelItemType[];
  QAModels: LLMModelItemType[];
  CQModels: FunctionModelItemType[];
  ExtractModels: FunctionModelItemType[];
  QGModels: LLMModelItemType[];
  VectorModels: VectorModelItemType[];
  AudioSpeechModels: AudioSpeechModelType[];
  WhisperModel: WhisperModelType;
};
export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModels: LLMModelItemType[];
  cqModels: FunctionModelItemType[];
  extractModels: FunctionModelItemType[];
  vectorModels: VectorModelItemType[];
  audioSpeechModels: AudioSpeechModels[];
  feConfigs: FeConfigsType;
  priceMd: string;
  systemVersion: string;
  simpleModeTemplates: AppSimpleEditConfigTemplateType[];
};
