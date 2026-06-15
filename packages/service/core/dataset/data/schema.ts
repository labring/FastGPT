import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { type DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getLogger, LogCategories } from '../../../common/logger';

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
  q: {
    type: String,
    required: function () {
      // 不是 string 类型（含 null/undefined/缺省）→ 报错
      return typeof this.q !== 'string';
    }
  },
  a: {
    type: String
  },
  imageId: String,
  imageDescMap: Object,
  history: {
    type: [
      {
        q: String,
        a: String,
        updateTime: Date
      }
    ]
  },
  metadata: Object,
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
        },
        // 同义词转换元数据
        synonymMetadata: {
          type: Object
        },
        synId: {
          type: Number
        }
      }
    ],
    default: []
  },

  // 同义词处理状态
  synonymProcessing: {
    type: String,
    enum: ['standardize', 'restore']
  },
  // 需要应用的同义词文件ID数组
  synonymFileIds: {
    type: [String]
  },

  updateTime: {
    type: Date,
    default: () => new Date()
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  indexingCompleteTime: {
    type: Date
  },
  chunkIndex: {
    type: Number,
    default: 0
  },
  rebuilding: Boolean,

  // Per-phase processing timings for performance tracking
  phaseTimings: {
    type: [
      {
        phase: { type: String },
        startTime: { type: Date },
        endTime: { type: Date }
      }
    ],
    default: []
  },

  // Abandon
  fullTextToken: String,
  initFullText: Boolean,
  initJieba: Boolean
});

try {
  // list collection and count data; list data; delete collection(relate data)
  DatasetDataSchema.index({
    teamId: 1,
    datasetId: 1,
    collectionId: 1,
    chunkIndex: 1,
    updateTime: -1
  });
  // Recall vectors after data matching
  DatasetDataSchema.index({ teamId: 1, datasetId: 1, collectionId: 1, 'indexes.dataId': 1 });
  // rebuild data
  DatasetDataSchema.index({ rebuilding: 1, teamId: 1, datasetId: 1 });

  // Cron clear invalid data
  DatasetDataSchema.index({ updateTime: 1 });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build dataset data indexes', { error });
}

export const MongoDatasetData = getMongoModel<DatasetDataSchemaType>(
  DatasetDataCollectionName,
  DatasetDataSchema
);
