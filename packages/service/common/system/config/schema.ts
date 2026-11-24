import { type SystemConfigsType } from '@fastgpt/global/common/system/config/type';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import { SystemConfigsTypeMap } from '@fastgpt/global/common/system/config/constants';

const { Schema } = connectionMongo;

const collectionName = 'systemConfigs';
const systemConfigSchema = new Schema(
  {
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
  },
  {
    // 此模型仅供迁移读取历史配置；从主库读取，避免迁入滞后副本中的旧快照。
    read: 'primary',
    writeConcern: { w: 'majority' }
  }
);

defineIndex(systemConfigSchema, { key: { type: 1 } });

export const MongoSystemConfigs = getMongoModel<SystemConfigsType>(
  collectionName,
  systemConfigSchema
);
