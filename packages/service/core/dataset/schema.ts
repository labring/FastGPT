import { getMongoModel, Schema } from '../../common/mongo';
import {
  DatasetStatusEnum,
  DatasetStatusMap,
  DatasetTypeEnum,
  DatasetTypeMap
} from '@fastgpt/global/core/dataset/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type.d';

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
  type: {
    type: String,
    enum: Object.keys(DatasetTypeMap),
    required: true,
    default: DatasetTypeEnum.dataset
  },
  status: {
    type: String,
    enum: Object.keys(DatasetStatusMap),
    default: DatasetStatusEnum.active
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  name: {
    type: String,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  vectorModel: {
    type: String,
    required: true,
    default: 'text-embedding-3-small'
  },
  agentModel: {
    type: String,
    required: true,
    default: 'gpt-4o-mini'
  },
  intro: {
    type: String,
    default: ''
  },
  websiteConfig: {
    type: {
      url: {
        type: String,
        required: true
      },
      selector: {
        type: String,
        default: 'body'
      }
    }
  },
  inheritPermission: {
    type: Boolean,
    default: true
  },
  apiServer: {
    type: Object
  },

  // abandoned
  externalReadUrl: {
    type: String
  },
  defaultPermission: Number
});

try {
  DatasetSchema.index({ teamId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDataset = getMongoModel<DatasetSchemaType>(DatasetCollectionName, DatasetSchema);
