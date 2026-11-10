import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constants';
import { ChunkSettings, DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const DatasetColCollectionName = 'dataset_collections';

const DatasetCollectionSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    default: null
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },

  // Basic info
  type: {
    type: String,
    enum: Object.keys(DatasetCollectionTypeMap),
    required: true
  },
  name: {
    type: String,
    required: true
  },
  tags: {
    type: [],
    default: []
  },

  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },

  // Metadata
  // local file collection
  // Support both GridFS ObjectId (string) and S3 key (string)
  fileId: String,
  // web link collection
  rawLink: String,
  // Api collection
  apiFileId: String,
  // external collection(Abandoned)
  externalFileId: String,
  externalFileUrl: String, // external import url

  rawTextLength: Number,
  hashRawText: String,

  metadata: {
    type: Object,
    default: {}
  },

  forbid: Boolean,

  // Permission: 继承态标记（默认 true = 快照 = merge(父级有效 clbs, 自身 clbs)）
  inheritPermission: {
    type: Boolean,
    default: true
  },

  // Parse settings
  customPdfParse: Boolean,
  apiFileParentId: String,

  // Chunk settings
  ...ChunkSettings
});

DatasetCollectionSchema.virtual('dataset', {
  ref: DatasetCollectionName,
  localField: 'datasetId',
  foreignField: '_id',
  justOne: true
});

// auth file
defineIndex(DatasetCollectionSchema, { key: { teamId: 1, fileId: 1 } });

// list collection; deep find collections
defineIndex(DatasetCollectionSchema, {
  key: {
    teamId: 1,
    datasetId: 1,
    parentId: 1,
    updateTime: -1
  }
});

// 文件夹枚举、非目录计数和根目录继承筛选共用；_id/parentId 投影可直接由索引返回。
defineIndex(DatasetCollectionSchema, {
  key: {
    teamId: 1,
    datasetId: 1,
    type: 1,
    parentId: 1,
    inheritPermission: 1,
    _id: 1
  }
});
// 同一 tags 元素内按 ID 和值筛选，兼容标量和多选数组。
defineIndex(DatasetCollectionSchema, {
  key: { teamId: 1, datasetId: 1, 'tags.tagId': 1, 'tags.value': 1 }
});
// 保留旧检索实例显式 hint 的索引，避免滚动更新期间旧查询失败。
defineIndex(DatasetCollectionSchema, {
  key: { teamId: 1, datasetId: 1, 'tags.tagId': 1 }
});
// 跨目录时间过滤与创建时间排序共用；目录候选可由已有 parentId 索引筛选后排序。
defineIndex(DatasetCollectionSchema, {
  key: { teamId: 1, datasetId: 1, createTime: 1 }
});

// Get collection by external file id
defineIndex(DatasetCollectionSchema, {
  key: { datasetId: 1, externalFileId: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      externalFileId: { $exists: true }
    }
  }
});

// 每次召回只读取禁用集合 ID；仅维护 forbid=true 的记录并覆盖查询投影。
defineIndex(DatasetCollectionSchema, {
  key: { teamId: 1, datasetId: 1, forbid: 1, _id: 1 },
  options: { partialFilterExpression: { forbid: true } }
});

// 废弃索引集中登记，启动时按名称和 key 精确清理。
// 原继承状态索引已合并到上方类型/目录索引。
defineIndex(DatasetCollectionSchema, {
  key: { teamId: 1, datasetId: 1, parentId: 1, inheritPermission: 1 },
  deprecated: true
});
// 旧格式标签索引不支持结构化字段定位；team/dataset 前缀由当前索引继续提供。
defineIndex(DatasetCollectionSchema, {
  key: { teamId: 1, datasetId: 1, tags: 1 },
  deprecated: true
});
// 旧图片清理任务已删除，当前不再按 relatedImgId 查询 Collection。
defineIndex(DatasetCollectionSchema, {
  key: {
    teamId: 1,
    'metadata.relatedImgId': 1
  },
  deprecated: true
});

export const MongoDatasetCollection = getMongoModel<DatasetCollectionSchemaType>(
  DatasetColCollectionName,
  DatasetCollectionSchema
);
