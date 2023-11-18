import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constant';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';

export const DatasetCollectionName = 'datasets';

const DatasetSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    default: null
  },
  userId: {
    //abandon
    type: Schema.Types.ObjectId,
    ref: 'user'
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  name: {
    type: String,
    required: true
  },
  vectorModel: {
    type: String,
    required: true,
    default: 'text-embedding-ada-002'
  },
  agentModel: {
    type: String,
    required: true,
    default: 'gpt-3.5-turbo-16k'
  },
  type: {
    type: String,
    enum: Object.keys(DatasetTypeMap),
    required: true,
    default: 'dataset'
  },
  tags: {
    type: [String],
    default: [],
    set(val: string | string[]) {
      if (Array.isArray(val)) return val;
      return val.split(' ').filter((item) => item);
    }
  },
  permission: {
    type: String,
    enum: Object.keys(PermissionTypeMap),
    default: PermissionTypeEnum.private
  }
});

try {
  DatasetSchema.index({ userId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDataset: Model<DatasetSchemaType> =
  models[DatasetCollectionName] || model(DatasetCollectionName, DatasetSchema);
MongoDataset.syncIndexes();
