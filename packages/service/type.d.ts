import { FastGPTFeConfigsType, SystemEnvType } from '@fastgpt/global/common/system/types';
import {
  TTSModelType,
  ReRankModelItemType,
  STTModelType,
  EmbeddingModelItemType,
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

  var workerPoll: Record<WorkerNameEnum, WorkerPool>;
}
