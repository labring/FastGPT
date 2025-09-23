import type { AppLogKeysSchemaType } from '@fastgpt/global/core/app/logs/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { AppCollectionName } from '../schema';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';

const { Schema } = connectionMongo;

export const AppLogKeysCollectionEnum = 'app_log_keys';

const AppLogKeysSchema = new Schema({
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

AppLogKeysSchema.index({ teamId: 1, appId: 1 });

export const MongoAppLogKeys = getMongoModel<AppLogKeysSchemaType>(
  AppLogKeysCollectionEnum,
  AppLogKeysSchema
);
