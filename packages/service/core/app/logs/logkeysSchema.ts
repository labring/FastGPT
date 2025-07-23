import type { LogKeysSchemaType } from '@fastgpt/global/core/app/logs/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { AppCollectionName } from '../schema';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';

const { Schema } = connectionMongo;

export const LogKeysCollectionEnum = 'log_keys';

const LogKeysSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  logKeys: {
    type: Array,
    required: true
  }
});

LogKeysSchema.index({ teamId: 1, appId: 1 });

export const MongoLogKeys = getMongoModel<LogKeysSchemaType>(LogKeysCollectionEnum, LogKeysSchema);
