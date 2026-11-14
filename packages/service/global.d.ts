import type {
  FastGPTFeConfigsType,
  LicenseDataType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import type { WorkerNameEnum } from './worker/utils';

declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
  var systemInitBufferId: string | undefined;
  var systemInstanceConfig: SystemInstanceConfig | undefined;

  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  /** Pro 进程直接读取部署配置；主服务未注入时通过服务间接口读取。 */
  var getSsoConfiguredHandler: (() => boolean | Promise<boolean>) | undefined;
  var agentUserTmbIds: ReadonlySet<string> | undefined;
  var subPlans: SubPlanType | undefined;
  var licenseData: LicenseDataType | undefined;

  // 不同 worker name 对应不同 Props/Response 泛型，注册表只负责保存实例，读取处再按 name 收窄。
  var workerPoll: Partial<Record<WorkerNameEnum, unknown>>;
}

export {};
