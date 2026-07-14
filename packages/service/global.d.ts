import type {
  FastGPTFeConfigsType,
  LicenseDataType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { WorkerNameEnum, WorkerPool } from './worker/utils';
import type { Pool as PgPool } from 'pg';
import type { Pool as MysqlPool } from 'mysql2/promise';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { S3BucketMapType } from './common/s3/contracts/type';

declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
  var systemInitBufferId: string | undefined;

  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;
  var licenseData: LicenseDataType | undefined;

  var workerPoll: Record<WorkerNameEnum, WorkerPool>;

  // ── databases (no per-module .d.ts) ──
  var pgClient: PgPool | null;
  var obClient: MysqlPool | null;
  var milvusClient: MilvusClient | null;

  // ── object storage ──
  var s3BucketMap: S3BucketMapType | undefined;

  // ── caches (no per-module .d.ts) ──
  var systemCache: Record<string, Record<string, unknown>> | undefined;
  var systemConfig: Record<string, unknown> | undefined;

  // ── app templates ──
  var appTemplates: unknown;
  var templatesRefreshTime: number | undefined;
}

export {};
