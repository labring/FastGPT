import { getMongoModel, Schema } from '../../../../common/mongo';
import type { DatasetSearchTrackSchemaType } from '@fastgpt/global/core/dataset/type.d';

export const DatasetSearchTrackCollectionName = 'dataset_search_tracks';

const DatasetSearchTrackSchema = new Schema({
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: 'datasets',
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'teams',
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  searchCount: {
    type: Number,
    default: 1
  }
});

try {
  DatasetSearchTrackSchema.index({
    datasetId: 1,
    teamId: 1,
    createTime: -1
  });
} catch (error) {
  console.log(error);
}

export const MongoDatasetSearchTrack = getMongoModel<DatasetSearchTrackSchemaType>(
  DatasetSearchTrackCollectionName,
  DatasetSearchTrackSchema
);
