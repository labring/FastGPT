import { connectionMongo, type Model } from '../../../common/mongo';
import type { DatasetSynonymMappingSchemaType } from '@fastgpt/global/core/dataset/type';
const { Schema } = connectionMongo;
import { DatasetSynonymMappingCollectionName } from '@fastgpt/global/core/dataset/constants';
import { getMongoModel } from '../../../common/mongo/index';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';

/**
 * 同义词映射集合
 * 用于存储标准化词到同义词的映射关系，支持全文检索和快速查询
 */
const DatasetSynonymMappingSchema = new Schema(
  {
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
    // 关联的同义词文件ID - 必填，用于删除文件时清理映射
    synonymFileId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    // 标准化词 - 必填，CSV第一列的标准词
    standardizedTerm: {
      type: String,
      required: true,
      trim: true
    },
    // 同义词数组 - 必填，CSV第2列及之后的所有列
    synonymTerms: {
      type: [String],
      required: true,
      default: []
    },
    // 组合搜索字段 - 必填，用于全文检索
    // 格式: "{标准词} {同义词1} {同义词2} ..."
    allTerms: {
      type: String,
      required: true
    },
    // 创建时间 - 自动设置
    createdTime: {
      type: Date,
      default: () => new Date()
    },
    // 更新时间 - 自动设置
    updatedTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    // 启用自动更新时间戳
    timestamps: {
      createdAt: 'createdTime',
      updatedAt: 'updatedTime'
    }
  }
);

// 索引设置
// 1. 文本索引 - 用于全文检索同义词（核心功能）
DatasetSynonymMappingSchema.index(
  { allTerms: 'text' },
  {
    weights: {
      allTerms: 10 // 提高权重以优化搜索结果
    },
    name: 'allTerms_text',
    default_language: 'none', // 不使用特定语言的词干提取
    textIndexVersion: 3 // 使用最新的文本索引版本
  }
);

// 2. 标准词+知识库复合索引 - 用于精确查询某个知识库中的标准词映射（批量查询场景）
DatasetSynonymMappingSchema.index({ datasetId: 1, standardizedTerm: 1 }, { unique: false });

// 3. 文件ID索引 - 用于删除同义词文件时批量删除映射
DatasetSynonymMappingSchema.index({ synonymFileId: 1 });

// 4. 团队+知识库+标准词三合一索引 - 用于最精确的查询（带权限校验的查询场景）
DatasetSynonymMappingSchema.index(
  { teamId: 1, datasetId: 1, standardizedTerm: 1 },
  { unique: false }
);

// 5. 创建时间索引 - 用于按时间排序和统计
DatasetSynonymMappingSchema.index({ createdTime: -1 });

/**
 * 导出 MongoDB 模型
 */
export const MongoDatasetSynonymMapping: Model<DatasetSynonymMappingSchemaType> = getMongoModel<
  DatasetSynonymMappingSchemaType
>(DatasetSynonymMappingCollectionName, DatasetSynonymMappingSchema);
