import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { type DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

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
    required: true
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
  rebuilding: Boolean,

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

  // 为查询 initJieba 字段不存在的数据添加索引
  DatasetDataSchema.index({ initJieba: 1, updateTime: 1 });

  // Cron clear invalid data
  DatasetDataSchema.index({ updateTime: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDatasetData = getMongoModel<DatasetDataSchemaType>(
  DatasetDataCollectionName,
  DatasetDataSchema
);
