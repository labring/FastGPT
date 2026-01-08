import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getMongoModel, Schema } from '../../../common/mongo';
import { AppCollectionName } from '../schema';
import type { AppRecordType } from './type';

export const AppRecordCollectionName = 'app_records';

const AppRecordSchema = new Schema(
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
      ref: AppCollectionName,
      required: true
    },
    lastUsedTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    timestamps: false
  }
);

AppRecordSchema.index({ tmbId: 1, lastUsedTime: -1 }); // 查询用户最近使用的应用
AppRecordSchema.index({ tmbId: 1, appId: 1 }, { unique: true }); // 防止重复记录
AppRecordSchema.index({ teamId: 1, appId: 1 }); // 用于清理权限失效的记录

export const MongoAppRecord = getMongoModel<AppRecordType>(
  AppRecordCollectionName,
  AppRecordSchema
);
