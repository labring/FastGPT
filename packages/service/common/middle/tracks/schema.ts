import { TrackSchemaType } from '@fastgpt/global/common/middle/tracks/type';
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

try {
  TrackSchema.index({ event: 1 });
} catch (error) {
  console.log(error);
}

export const TrackModel = getMongoModel<TrackSchemaType>('track', TrackSchema);
