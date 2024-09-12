import { FastGPTFeConfigsType, SystemEnvType } from '@fastgpt/global/common/system/types';
import {
  AudioSpeechModelType,
  ReRankModelItemType,
  WhisperModelType,
  VectorModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.d';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { WorkerNameEnum, WorkerPool } from './worker/utils';
import { Worker } from 'worker_threads';
import { TemplateMarketItemType } from '@fastgpt/global/core/workflow/type';

declare global {
  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;

  var llmModels: LLMModelItemType[];
  var vectorModels: VectorModelItemType[];
  var audioSpeechModels: AudioSpeechModelType[];
  var whisperModel: WhisperModelType;
  var reRankModels: ReRankModelItemType[];

  var systemLoadedGlobalVariables: boolean;
  var systemLoadedGlobalConfig: boolean;

  var workerPoll: Record<WorkerNameEnum, WorkerPool>;
  var appMarketTemplates: TemplateMarketItemType[];
}
