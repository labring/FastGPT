import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetDataCollectionName } from './schema';

export const DatasetDataTextCollectionName = 'dataset_data_texts';

const DatasetDataTextSchema = new Schema({
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
  collectionId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    required: true
  },
  dataId: {
    type: Schema.Types.ObjectId,
    ref: DatasetDataCollectionName,
    required: true
  },
  fullTextToken: String
});

try {
  DatasetDataTextSchema.index({ teamId: 1, datasetId: 1, fullTextToken: 'text' });
  DatasetDataTextSchema.index({ dataId: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoDatasetDataText = getMongoModel<DatasetDataSchemaType>(
  DatasetDataTextCollectionName,
  DatasetDataTextSchema
);
