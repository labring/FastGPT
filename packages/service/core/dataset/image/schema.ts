import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../../common/mongo';
import { DatasetImageSchemaType } from '@fastgpt/global/core/dataset/image/type.d';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';

export const DatasetImageCollectionName = 'dataset_images';

const DatasetImageSchema = new Schema({
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
    ref: DatasetColCollectionName
  },
  binary: Buffer,
  metadata: {
    type: Object,
    default: {}
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  expiredTime: Date
});

try {
  // 创建索引以提高查询效率
  // 基于teamId, datasetId查询
  DatasetImageSchema.index({ teamId: 1, datasetId: 1 });

  // 基于collectionId查询，用于检索特定集合的图片
  DatasetImageSchema.index({ teamId: 1, datasetId: 1, collectionId: 1 });

  // 基于文档ID查询
  DatasetImageSchema.index({ teamId: 1, 'metadata.relatedDocId': 1 });

  // 过期时间索引，用于自动清理临时图片
  DatasetImageSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 0 });
} catch (error) {
  console.log(error);
}

export const MongoDatasetImage = getMongoModel<DatasetImageSchemaType>(
  DatasetImageCollectionName,
  DatasetImageSchema
);
