import { SystemConfigsType } from '@fastgpt/global/common/system/config/type';
import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
import { SystemConfigsTypeMap } from '@fastgpt/global/common/system/config/constants';

const { Schema, model, models } = connectionMongo;

const collectionName = 'systemConfigs';
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

try {
  systemConfigSchema.index({ type: 1 });
} catch (error) {
  console.log(error);
}

export const MongoSystemConfigs = getMongoModel<SystemConfigsType>(
  collectionName,
  systemConfigSchema
);
