import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { serviceEnv } from '../../../env';

export const DatasetDataCollectionName = 'dataset_datas';

const DatasetDataSchema = new Schema({
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
  collectionId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    required: true
  },
  q: String,
  a: {
    type: String
  },
  imageId: String,
  imageDescMap: Object,
  metadata: {
    type: Object
  },
  history: {
    type: [
      {
        q: String,
        a: String,
        updateTime: Date
      }
    ]
  },
  indexes: {
    type: [
      {
        // Abandon
        defaultIndex: {
          type: Boolean
        },
        type: {
          type: String,
          enum: Object.values(DatasetDataIndexTypeEnum),
          default: DatasetDataIndexTypeEnum.custom
        },
        dataId: {
          type: String,
          required: true
        },
        text: {
          type: String,
          required: true
        }
      }
    ],
    default: []
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  chunkIndex: {
    type: Number,
    default: 0
  },
  indexStatus: {
    type: String,
    enum: Object.values(DatasetDataIndexStatusEnum)
  },
  indexErrorMsg: String,
  synonymVersion: Number,
  synonymRebuildingVersion: Number,

  // Abandon
  fullTextToken: String,
  initFullText: Boolean,
  initJieba: Boolean
});

// list collection and count data; list data; delete collection(relate data)
defineIndex(DatasetDataSchema, {
  key: {
    teamId: 1,
    datasetId: 1,
    collectionId: 1,
    chunkIndex: 1,
    updateTime: -1
  }
});
// Recall vectors after data matching
defineIndex(DatasetDataSchema, {
  key: { teamId: 1, datasetId: 1, collectionId: 1, 'indexes.dataId': 1 }
});
// rebuild data
defineIndex(DatasetDataSchema, {
  key: { indexStatus: 1, teamId: 1, datasetId: 1 }
});
// 集合列表统计数量和重建状态时直接读取索引，避免读取 q/a、indexes 等完整文档。
defineIndex(DatasetDataSchema, {
  key: { teamId: 1, datasetId: 1, collectionId: 1, indexStatus: 1 }
});

if (serviceEnv.DATASET_SYNONYM_ENABLED) {
  defineIndex(DatasetDataSchema, {
    key: { teamId: 1, datasetId: 1, synonymVersion: 1, synonymRebuildingVersion: 1 }
  });
}

// Cron clear invalid data
defineIndex(DatasetDataSchema, { key: { updateTime: 1 } });

// FastGPT 旧版重建标记索引已由 indexStatus 索引替代。
defineIndex(DatasetDataSchema, {
  key: { rebuilding: 1, teamId: 1, datasetId: 1 },
  deprecated: true
});

export const MongoDatasetData = getMongoModel<DatasetDataSchemaType>(
  DatasetDataCollectionName,
  DatasetDataSchema
);
