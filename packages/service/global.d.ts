import type {
  FastGPTFeConfigsType,
  LicenseDataType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { WorkerNameEnum, WorkerPool } from './worker/utils';
import type {
  LLMModelItemType,
  EmbeddingModelItemType,
  RerankModelItemType,
  TTSModelType,
  STTModelType
} from '@fastgpt/global/core/ai/model.schema';
import type { DeepRagSearchProps, SearchDatasetDataResponse } from './core/dataset/search';
import type { AuthOpenApiLimitProps } from './support/openapi/auth';
import type {
  CreateUsageProps,
  ConcatUsageProps,
  PushUsageItemsProps
} from '@fastgpt/global/support/wallet/usage/api';
import type { Mongoose } from 'mongoose';
import type Redis from 'ioredis';
import type { Pool as PgPool } from 'pg';
import type { Pool as MysqlPool } from 'mysql2/promise';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Queue } from 'bullmq';
import type { S3BucketMapType } from './common/s3/contracts/type';

declare global {
  // ── version & feature flags ──
  var systemVersion: string;
  var feConfigs: FastGPTFeConfigsType;
  var systemEnv: SystemEnvType;
  var subPlans: SubPlanType | undefined;
  var licenseData: LicenseDataType | undefined;

  // ── databases ──
  var mongodb: Mongoose | undefined;
  var mongodbLog: Mongoose | undefined;
  var redisClient: Redis | null;
  var pgClient: PgPool | null;
  var obClient: MysqlPool | null;
  var milvusClient: MilvusClient | null;

  // ── object storage ──
  var s3BucketMap: S3BucketMapType | undefined;

  // ── AI / model configs ──
  var llmModelMap: Map<string, LLMModelItemType> | undefined;
  var embeddingModelMap: Map<string, EmbeddingModelItemType> | undefined;
  var reRankModelMap: Map<string, RerankModelItemType> | undefined;
  var sttModelMap: Map<string, STTModelType> | undefined;
  var ttsModelMap: Map<string, TTSModelType> | undefined;
  var systemDefaultModel: LLMModelItemType | undefined;
  var systemActiveModelList: LLMModelItemType[] | undefined;
  var systemActiveDesensitizedModels: LLMModelItemType[] | undefined;
  var systemModelList: LLMModelItemType[] | undefined;
  var systemCache: Record<string, Record<string, unknown>> | undefined;
  var systemConfig: Record<string, unknown> | undefined;

  // ── provider caches ──
  var ModelProviderListCache: unknown;
  var ModelProviderMapCache: unknown;
  var ModelProviderRawCache: unknown;

  // ── app templates ──
  var appTemplates: unknown;
  var templatesRefreshTime: number | undefined;

  // ── AI proxy ──
  var aiproxyChannelsCache: unknown;

  // ── BullMQ ──
  var queues: Map<string, Queue>;
  var workerPoll: Record<WorkerNameEnum, WorkerPool>;

  // ── pro/commercial handlers (set by pro/admin when available) ──
  var textCensorHandler: (params: { text: string }) => Promise<{ code: number; message?: string }>;
  var deepRagHandler: (data: DeepRagSearchProps) => Promise<SearchDatasetDataResponse>;
  var authOpenApiHandler: (data: AuthOpenApiLimitProps) => Promise<any>;
  var createUsageHandler: (data: CreateUsageProps) => any;
  var concatUsageHandler: (data: ConcatUsageProps) => any;
  var pushUsageItemsHandler: (data: PushUsageItemsProps) => any;

  // ── infra ──
  var systemInitBufferId: string | undefined;
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
  var workers: Map<string, Queue>;
}

export {};
