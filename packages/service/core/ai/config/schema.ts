import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { SystemModelSchemaType } from '../type';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

const SystemModelSchema = new Schema({
  model: {
    type: String,
    required: true
  },
  metadata: {
    type: Object,
    required: true,
    default: {}
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  isShared: {
    type: Boolean,
    default: false
  }
});

SystemModelSchema.index({ teamId: 1 });
SystemModelSchema.index({ tmbId: 1 });
SystemModelSchema.index({ isShared: 1 });

export const MongoSystemModel = getMongoModel<SystemModelSchemaType>(
  'system_models',
  SystemModelSchema
);
