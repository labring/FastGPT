import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;

export const DatasetMigrationLogCollectionName = 'dataset_migration_logs';

export type DatasetMigrationLogSchemaType = {
  _id: string;

  // 迁移批次信息
  batchId: string; // 同一次运行的迁移使用相同的 batchId
  migrationVersion: string; // 如 'v4.14.3'

  // 资源类型和标识
  resourceType: 'collection' | 'dataset_image'; // 支持不同类型的文件迁移
  resourceId: string; // collection._id 或 image._id
  teamId: string;
  datasetId?: string; // collection 有，image 可能没有

  // 迁移前后的存储信息
  sourceStorage: {
    type: 'gridfs';
    fileId: string; // GridFS 的 ObjectId
    bucketName: string; // 'dataset' or 'chat'
    fileSize?: number; // 文件大小（字节）
    checksum?: string; // MD5/SHA256
  };

  targetStorage?: {
    type: 's3';
    key: string; // S3 key
    bucket?: string; // S3 bucket名称
    fileSize?: number;
    checksum?: string;
  };

  // 迁移状态
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rollback' | 'verified';

  // 时间戳
  createdAt: Date; // 创建时间
  startedAt?: Date; // 开始迁移时间
  completedAt?: Date; // 完成时间
  rolledBackAt?: Date; // 回滚时间

  // 重试信息
  attemptCount: number; // 尝试次数
  maxAttempts: number; // 最大重试次数
  lastAttemptAt?: Date; // 最后一次尝试时间

  // 错误信息
  error?: {
    message: string;
    stack?: string;
    code?: string; // 错误代码，便于分类统计
    phase: 'download' | 'upload' | 'verify' | 'update_db'; // 错误发生在哪个阶段
  };

  // 校验信息
  verified: boolean; // 是否已验证数据一致性
  verifiedAt?: Date;

  // 操作日志（记录详细步骤）
  operations: Array<{
    action: string; // 'start_download', 'upload_to_s3', 'update_collection', 'rollback' 等
    timestamp: Date;
    success: boolean;
    duration?: number; // 耗时（毫秒）
    details?: any; // 额外信息
  }>;

  // 元数据（用于调试和审计）
  metadata: {
    fileName?: string; // 原文件名
    fileType?: string; // 文件类型
    originalUpdateTime?: Date; // collection 的原始更新时间
    executorIp?: string; // 执行迁移的服务器 IP
    nodeEnv?: string; // 'production' or 'development'
  };

  // 回滚信息
  rollbackInfo?: {
    reason: string; // 回滚原因
    rolledBackBy?: string; // 操作人员或系统
    s3FileDeleted: boolean; // S3 文件是否已删除
    dbRestored: boolean; // 数据库是否已恢复
  };
};

const DatasetMigrationLogSchema = new Schema({
  // 批次信息
  batchId: {
    type: String,
    required: true,
    index: true
  },
  migrationVersion: {
    type: String,
    required: true
  },

  // 资源类型和标识
  resourceType: {
    type: String,
    enum: ['collection', 'dataset_image'],
    required: true
  },
  resourceId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    index: true
  },

  // 存储信息
  sourceStorage: {
    type: {
      type: String,
      default: 'gridfs'
    },
    fileId: {
      type: String,
      required: true
    },
    bucketName: String,
    fileSize: Number,
    checksum: String
  },

  targetStorage: {
    type: {
      type: String,
      default: 's3'
    },
    key: String,
    bucket: String,
    fileSize: Number,
    checksum: String
  },

  // 状态
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'rollback', 'verified'],
    default: 'pending',
    required: true,
    index: true
  },

  // 时间戳
  createdAt: {
    type: Date,
    default: () => new Date(),
    index: true
  },
  startedAt: Date,
  completedAt: Date,
  rolledBackAt: Date,

  // 重试信息
  attemptCount: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  lastAttemptAt: Date,

  // 错误信息
  error: {
    message: String,
    stack: String,
    code: String,
    phase: {
      type: String,
      enum: ['download', 'upload', 'verify', 'update_db']
    }
  },

  // 校验信息
  verified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,

  // 操作日志
  operations: [
    {
      action: String,
      timestamp: {
        type: Date,
        default: () => new Date()
      },
      success: Boolean,
      duration: Number,
      details: Schema.Types.Mixed
    }
  ],

  // 元数据
  metadata: {
    fileName: String,
    fileType: String,
    originalUpdateTime: Date,
    executorIp: String,
    nodeEnv: String
  },

  // 回滚信息
  rollbackInfo: {
    reason: String,
    rolledBackBy: String,
    s3FileDeleted: Boolean,
    dbRestored: Boolean
  }
});

// 索引优化
try {
  // 查询某个批次的迁移状态
  DatasetMigrationLogSchema.index({ batchId: 1, status: 1 });

  // 查询某个资源的迁移历史
  DatasetMigrationLogSchema.index({ resourceType: 1, resourceId: 1 });

  // 查询失败的迁移（需要重试）
  DatasetMigrationLogSchema.index({
    status: 1,
    attemptCount: 1,
    lastAttemptAt: 1
  });

  // 查询某个团队的迁移情况
  DatasetMigrationLogSchema.index({ teamId: 1, status: 1 });

  // 唯一索引：同一个资源在同一个批次只能有一条记录
  DatasetMigrationLogSchema.index({ batchId: 1, resourceType: 1, resourceId: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoDatasetMigrationLog = getMongoModel<DatasetMigrationLogSchemaType>(
  DatasetMigrationLogCollectionName,
  DatasetMigrationLogSchema
);
