import { type TrackSchemaType } from '@fastgpt/global/common/middle/tracks/type';
import { defineIndex, getMongoModel, Schema } from '../../mongo';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const TrackSchema = new Schema({
  event: { type: String, required: true, enum: Object.values(TrackEnum) },
  uid: String,
  teamId: String,
  tmbId: String,
  createTime: { type: Date, default: () => new Date() },
  data: Object
});

defineIndex(TrackSchema, { key: { event: 1 } });
// Dataset search index
defineIndex(TrackSchema, {
  key: { event: 1, teamId: 1, 'data.datasetId': 1, createTime: -1 },
  options: {
    partialFilterExpression: {
      event: TrackEnum.datasetSearch
    }
  }
});
// QPM index
defineIndex(TrackSchema, {
  key: { event: 1, createTime: -1, 'data.requestCount': 1 },
  options: {
    partialFilterExpression: {
      event: TrackEnum.teamChatQPM
    }
  }
});

// 全局点击按小时唯一，避免多个实例同时刷新时生成重复桶；不影响其他事件的逐条写入。
defineIndex(TrackSchema, {
  key: { event: 1, createTime: 1 },
  options: {
    unique: true,
    partialFilterExpression: { event: TrackEnum.workflowBuilderClick }
  }
});

export const TrackModel = getMongoModel<TrackSchemaType>('tracks', TrackSchema);
