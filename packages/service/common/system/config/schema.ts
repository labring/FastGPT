import { type SystemConfigsType } from '@fastgpt/global/common/system/config/type';
import { defineIndex, connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import { SystemConfigsTypeMap } from '@fastgpt/global/common/system/config/constants';
import { getLogger, LogCategories } from '../../logger';

const { Schema, model, models } = connectionMongo;

const collectionName = 'systemConfigs';
const logger = getLogger(LogCategories.INFRA.MONGO);
const systemConfigSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: Object.keys(SystemConfigsTypeMap)
  },
  value: {
    type: Object,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

defineIndex(systemConfigSchema, { key: { type: 1 } });

export const MongoSystemConfigs = getMongoModel<SystemConfigsType>(
  collectionName,
  systemConfigSchema
);
