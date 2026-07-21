import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type DatasetDataTextSchemaType } from '@fastgpt/global/core/dataset/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetDataCollectionName } from './schema';
import { getLogger, LogCategories } from '../../../common/logger';

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
  defineIndex(DatasetDataTextSchema, {
    key: { teamId: 1, fullTextToken: 'text' },
    options: {
      name: 'teamId_1_fullTextToken_text',
      default_language: 'none'
    }
  });
  defineIndex(DatasetDataTextSchema, {
    key: { teamId: 1, datasetId: 1, collectionId: 1 }
  });
  defineIndex(DatasetDataTextSchema, { key: { dataId: 'hashed' } });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build dataset data text indexes', { error });
}

export const MongoDatasetDataText = getMongoModel<DatasetDataTextSchemaType>(
  DatasetDataTextCollectionName,
  DatasetDataTextSchema
);
