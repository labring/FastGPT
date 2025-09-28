import type {
  FastGPTFeConfigsType,
  LicenseDataType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import {
  TTSModelType,
  RerankModelItemType,
  STTModelType,
  EmbeddingModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.d';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { WorkerNameEnum, WorkerPool } from './worker/utils';
import { Worker } from 'worker_threads';
import type { DatasetSearchTrackProps } from '@fastgpt/global/core/dataset/api';

declare global {
  var systemInitBufferId: string | undefined;

  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;
  var licenseData: LicenseDataType | undefined;

  var workerPoll: Record<WorkerNameEnum, WorkerPool>;
  var tracksQueue: { event: TrackEnum; data: Record<string, any> }[];
}
