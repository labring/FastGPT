import type {
  FastGPTFeConfigsType,
  LicenseDataType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { WorkerNameEnum, WorkerPool } from './worker/utils';

declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
  var systemInitBufferId: string | undefined;

  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;
  var licenseData: LicenseDataType | undefined;

  var workerPoll: Record<WorkerNameEnum, WorkerPool>;
}

export {};
