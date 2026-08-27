import type {
  FastGPTFeConfigsType,
  LicenseDataType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { WorkerNameEnum } from './worker/utils';

declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
  var systemInitBufferId: string | undefined;

  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;
  var licenseData: LicenseDataType | undefined;

  // 不同 worker name 对应不同 Props/Response 泛型，注册表只负责保存实例，读取处再按 name 收窄。
  var workerPoll: Partial<Record<WorkerNameEnum, unknown>>;

  var systemConfig: Record<string, unknown> | undefined;
}

export {};
