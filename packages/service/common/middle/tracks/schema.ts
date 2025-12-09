import { type TrackSchemaType } from '@fastgpt/global/common/middle/tracks/type';
import { getMongoModel, Schema } from '../../mongo';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const TrackSchema = new Schema({
  event: { type: String, required: true, enum: Object.values(TrackEnum) },
  uid: String,
  teamId: String,
  tmbId: String,
  createTime: { type: Date, default: () => new Date() },
  data: Object
});

TrackSchema.index({ event: 1 });
// Dataset search index
TrackSchema.index(
  { event: 1, teamId: 1, 'data.datasetId': 1, createTime: -1 },
  {
    partialFilterExpression: {
      event: TrackEnum.datasetSearch
    }
  }
);
// QPM index
TrackSchema.index(
  { event: 1, createTime: -1, 'data.requestCount': 1 },
  {
    partialFilterExpression: {
      event: TrackEnum.teamChatQPM
    }
  }
);

export const TrackModel = getMongoModel<TrackSchemaType>('tracks', TrackSchema);
