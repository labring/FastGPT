import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import { DatasetCollectionName } from '../schema';
import { type DatasetCollectionTagsSchemaType } from '@fastgpt/global/core/dataset/type';
import { getLogger, LogCategories } from '../../../common/logger';
const { Schema } = connectionMongo;

export const DatasetCollectionTagsName = 'dataset_collection_tags';

const DatasetCollectionTagsSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  tag: {
    type: String,
    required: true
  }
});

try {
  DatasetCollectionTagsSchema.index({ teamId: 1, datasetId: 1, tag: 1 });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build dataset tag indexes', { error });
}

export const MongoDatasetCollectionTags = getMongoModel<DatasetCollectionTagsSchemaType>(
  DatasetCollectionTagsName,
  DatasetCollectionTagsSchema
);
