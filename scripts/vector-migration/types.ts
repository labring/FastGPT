/**
 * 向量数据迁移工具类型定义
 */

export type DatabaseType = 'pg' | 'oceanbase' | 'milvus';

export interface VectorRecord {
  id: string;
  vector: number[];
  team_id: string;
  dataset_id: string;
  collection_id: string;
  createtime: Date | string;
}

export interface DatabaseConfig {
  type: DatabaseType;
  // PostgreSQL 配置
  pgUrl?: string;
  // OceanBase 配置
  oceanbaseUrl?: string;
  // Milvus 配置
  milvusAddress?: string;
  milvusToken?: string;
}

export interface MigrationConfig {
  source: DatabaseConfig;
  target: DatabaseConfig;
  batchSize?: number; // 每批处理数量，默认 1000
  checkpointDir?: string; // 检查点目录，默认 ./checkpoints
  enableCDC?: boolean; // 是否启用 CDC 增量同步
  cdcPollInterval?: number; // CDC 轮询间隔（毫秒），默认 5000
}

export interface Checkpoint {
  lastId?: string; // 最后处理的 ID
  lastTimestamp?: string; // 最后处理的时间戳
  totalProcessed: number; // 已处理总数
  totalFailed: number; // 失败总数
  startTime: string; // 开始时间
  lastUpdateTime: string; // 最后更新时间
  phase: MigrationPhase; // 当前阶段
  batches: BatchCheckpoint[]; // 批次检查点
}

export interface BatchCheckpoint {
  batchId: string;
  startId: string;
  endId: string;
  processed: number;
  failed: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
}

export type MigrationPhase =
  | 'precheck'
  | 'full_export'
  | 'full_import'
  | 'index_build'
  | 'validation'
  | 'cdc_sync'
  | 'completed';

export interface MigrationProgress {
  phase: MigrationPhase;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  currentBatch: number;
  totalBatches: number;
  percentage: number;
  estimatedTimeRemaining?: number; // 预计剩余时间（秒）
  speed?: number; // 处理速度（条/秒）
}

export interface MigrationResult {
  success: boolean;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  startTime: string;
  endTime: string;
  duration: number; // 耗时（秒）
  errors?: string[];
}
