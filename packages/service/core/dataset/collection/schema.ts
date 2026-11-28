import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import {
  DatasetCollectionTrainingSchema,
  type DatasetCollectionSchemaType
} from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionTypeMap, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ChunkSettings, DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { attachNameSortKeyHooks } from '../../../common/mongo/nameSortKeyHook';
import { buildDatasetCollectionNameSortKey } from './sortKey';

export const DatasetColCollectionName = 'dataset_collections';

/**
 * MongoDB 持久化层集合文档类型。
 * `nameSortKey` 仅作内部排序索引字段，不加入对外共享的 `DatasetCollectionSchema`（避免透出至详情/引用出参与 SDK）。
 * v4.18.0 后台迁移过渡期暂保持可选，下一版本确认全量回填后改为必填。
 */
export type DatasetCollectionMongoSchemaType = DatasetCollectionSchemaType & {
  nameSortKey?: string;
};

const CollectionParseSchema = new Schema(
  {
    status: {
      type: String,
      enum: DatasetCollectionTrainingSchema.shape.parse.unwrap().shape.status.options,
      required: true
    },
    errorMsg: String
  },
  { _id: false }
);

const CollectionTrainingSchema = new Schema(
  {
    status: {
      type: String,
      enum: DatasetCollectionTrainingSchema.shape.status.options,
      required: true
    },
    pausedAt: Date,
    parse: CollectionParseSchema,
    usageId: {
      type: String,
      required: true,
      validate: (value: string) =>
        DatasetCollectionTrainingSchema.shape.usageId.safeParse(value).success
    },
    runId: String,
    runningItems: { type: Map, of: { type: String, enum: Object.values(TrainingModeEnum) } },
    revision: { type: Number, required: true }
  },
  { _id: false }
);

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
  /**
   * 基于集合名生成的规范化拼音排序键（0:字母/拼音、1:数字、2:其他），用于集合列表按名称索引排序分页。
   * 存量文档由自动系统迁移任务分批回填。
   */
  nameSortKey: {
    type: String,
    default: function (this: { name?: string } | null | undefined) {
      return buildDatasetCollectionNameSortKey(this?.name);
    }
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
  // 直接写入的正文图片独立归集合管理；重训更换 _id 时沿用此目录。
  chunkImagePrefixId: String,
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
  // API 目录/节点级同步范围标记；缺省（undefined）兼容存量视为 true，显式 false 表示不自动拉取新增直属子级
  syncChildren: Boolean,
  training: CollectionTrainingSchema,

  // Chunk settings
  ...ChunkSettings
});

DatasetCollectionSchema.virtual('dataset', {
  ref: DatasetCollectionName,
  localField: 'datasetId',
  foreignField: '_id',
  justOne: true
});

attachNameSortKeyHooks<DatasetCollectionMongoSchemaType>(
  DatasetCollectionSchema,
  buildDatasetCollectionNameSortKey
);

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

// 集合列表按名称拼音排序分页（目录浏览正向/逆向索引扫描，过渡期 null 探测复用同前缀）
defineIndex(DatasetCollectionSchema, {
  key: {
    teamId: 1,
    datasetId: 1,
    parentId: 1,
    nameSortKey: 1,
    _id: 1
  },
  options: {
    name: 'fg_dataset_col_parent_name_sort',
    background: true
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
// create time filter
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

defineIndex(DatasetCollectionSchema, {
  key: { 'training.status': 1, 'training.pausedAt': 1, _id: 1 },
  options: {
    name: 'fg_dataset_collection_training_pause',
    partialFilterExpression: { 'training.status': { $exists: true } }
  }
});

export const MongoDatasetCollection = getMongoModel<DatasetCollectionMongoSchemaType>(
  DatasetColCollectionName,
  DatasetCollectionSchema
);
