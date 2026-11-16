import z from 'zod';
import { nonNegativeInteger, positiveInteger } from './primitives';

export const ResourceConfigSchema = z.strictObject({
  serviceRequestMaxContentLength: positiveInteger(10),
  serviceAxiosMaxContentLength: nonNegativeInteger(20).meta({
    description:
      '共享 HTTP 客户端缓冲型响应的解压后大小上限（MiB）；0 仅允许空响应，调用方显式限制优先，流式响应使用业务配额'
  }),
  maxFolderDepth: z.number().int().min(2).max(20).default(4),
  // 旧 env IntSchema 允许 0，消费点为纯数值比较（folderCount + amount > max），
  // 0 = 禁止创建新目录；保持迁移前后一致
  appFolderMaxAmount: nonNegativeInteger(1000),
  datasetFolderMaxAmount: nonNegativeInteger(1000),
  uploadFileMaxSize: positiveInteger(1000),
  uploadFileMaxAmount: positiveInteger(1000),
  evaluationMaxRows: nonNegativeInteger(1000).meta({
    description: '单次评估任务最大数据行数，不含表头；0 表示禁止创建包含数据的评估任务'
  }),
  datasetArchive: z
    .strictObject({
      maxFiles: positiveInteger(2000).meta({
        description: '知识库单次归档允许包含的原始文件数上限'
      }),
      maxSourceSizeMiB: positiveInteger(2048).meta({
        description: '知识库单次归档原始文件逻辑总大小上限（MiB）'
      }),
      maxConcurrency: positiveInteger(4).meta({
        description: 'Redis 集群中同时执行的知识库归档任务数上限'
      }),
      prepareTimeoutSeconds: positiveInteger(300).meta({
        description: '知识库归档发送响应头前的最长准备时间（秒）'
      })
    })
    .prefault({}),
  systemMaxStringLengthM: z.number().int().min(1).max(100).default(100),
  // 旧配置允许小数分钟（例如 0.1 = 6 秒），迁移时必须原样保留
  exportDatasetLimitMinutes: z.number().nonnegative().default(0),
  websiteSyncLimitMinuted: z.number().nonnegative().default(0)
});
