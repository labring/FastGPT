import { connectionMongo, type Model } from '../../../common/mongo';
import type { DatasetSynonymSchemaType } from '@fastgpt/global/core/dataset/type';
const { Schema } = connectionMongo;
import { DatasetSynonymCollectionName } from '@fastgpt/global/core/dataset/constants';
import { getMongoModel } from '../../../common/mongo/index';
import {
  TeamMemberCollectionName,
  TeamCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';

/**
 * 同义词文件元数据集合
 * 用于管理上传到知识库的同义词CSV文件
 */
const DatasetSynonymSchema = new Schema({
  // 团队ID - 必填
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  // 知识库ID - 必填，关联到具体的知识库
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  // 文件名 - 必填
  fileName: {
    type: String,
    required: true
  },
  // S3 文件 key - 必填，存储在 S3/MinIO 中的对象键
  fileId: {
    type: String,
    required: true
  },
  // 文件大小（字节） - 必填
  size: {
    type: Number,
    required: true
  },
  // 上传时间 - 自动设置
  uploadTime: {
    type: Date,
    default: () => new Date()
  },
  // 上传者ID - 必填
  uploaderId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  }
});

// 索引设置
// 1. 知识库查询索引 - 通过知识库ID查询同义词文件（最常用）
DatasetSynonymSchema.index({ datasetId: 1 });

// 2. 团队查询索引 - 通过团队ID查询该团队的所有同义词文件
DatasetSynonymSchema.index({ teamId: 1 });

// 3. S3 key 索引 - 通过 S3 key 查询元数据
DatasetSynonymSchema.index({ fileId: 1 });

// 4. 复合索引 - 团队+知识库，用于权限校验和精确查询
DatasetSynonymSchema.index({ teamId: 1, datasetId: 1 });

// 5. 上传时间索引 - 用于按时间排序和清理过期文件
DatasetSynonymSchema.index({ uploadTime: -1 });

/**
 * 导出 MongoDB 模型
 */
export const MongoDatasetSynonym: Model<DatasetSynonymSchemaType> =
  getMongoModel<DatasetSynonymSchemaType>(DatasetSynonymCollectionName, DatasetSynonymSchema);
