import { FastGPTFeConfigsType, SystemEnvType } from '@fastgpt/global/common/system/types';
import {
  AudioSpeechModelType,
  ReRankModelItemType,
  STTModelType,
  VectorModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.d';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { WorkerNameEnum, WorkerPool } from './worker/utils';
import { Worker } from 'worker_threads';

declare global {
  var systemInitBufferId: string | undefined;
  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;

  var llmModels: LLMModelItemType[];
  var llmModelPriceType: 'IO' | 'Tokens';
  var vectorModels: VectorModelItemType[];
  var audioSpeechModels: AudioSpeechModelType[];
  var whisperModel: STTModelType;
  var reRankModels: ReRankModelItemType[];

  var workerPoll: Record<WorkerNameEnum, WorkerPool>;
}
