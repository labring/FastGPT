import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import { DatasetCollectionName } from '../schema';
import { DatasetCollectionTagsSchemaType } from '@fastgpt/global/core/dataset/type';
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
  console.log(error);
}

export const MongoDatasetCollectionTags = getMongoModel<DatasetCollectionTagsSchemaType>(
  DatasetCollectionTagsName,
  DatasetCollectionTagsSchema
);
