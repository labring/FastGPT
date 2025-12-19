import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getMongoModel, Schema } from '../../../common/mongo';

export const AppUsageCollectionName = 'app_usages';

const AppUsageSchema = new Schema(
  {
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: TeamMemberCollectionName,
      required: true
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: TeamCollectionName,
      required: true
    },
    appId: {
      type: Schema.Types.ObjectId,
      ref: 'apps',
      required: true
    },
    lastUsedTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    minimize: false,
    timestamps: false
  }
);

AppUsageSchema.index({ tmbId: 1, lastUsedTime: -1 }); // 查询用户最近使用的应用
AppUsageSchema.index({ tmbId: 1, appId: 1 }, { unique: true }); // 防止重复记录
AppUsageSchema.index({ teamId: 1, appId: 1 }); // 用于清理权限失效的记录

export const MongoAppUsage = getMongoModel<AppUsageType>(AppUsageCollectionName, AppUsageSchema);

export type AppUsageType = {
  _id?: string;
  tmbId: string;
  teamId: string;
  appId: string;
  lastUsedTime: Date;
};
