import { hashStr } from '@fastgpt/global/common/string/tools';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';
import mongoose, { Schema, type InferSchemaType, type Model, type Mongoose } from 'mongoose';
import { tables } from '../../db';
import { defineIndex } from '../indexes';
import type { WithId__v } from '../types';

export const UserDocumentSchema = new Schema({
  status: {
    type: String,
    enum: Object.keys(userStatusMap),
    default: UserStatusEnum.active
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true,
    set: (value: string) => hashStr(value),
    get: (value: string) => hashStr(value),
    select: false
  },
  passwordUpdateTime: Date,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  promotionRate: {
    type: Number,
    default: 0
  },
  openaiAccount: {
    type: {
      key: String,
      baseUrl: String
    }
  },
  timezone: {
    type: String,
    default: 'Asia/Shanghai'
  },
  language: {
    type: String,
    default: LangEnum.zh_CN
  },
  lastLoginTmbId: {
    type: Schema.Types.ObjectId,
    ref: tables.teamMember
  },
  inviterId: {
    type: Schema.Types.ObjectId,
    ref: tables.user
  },
  fastgpt_sem: Object,
  phonePrefix: Number,
  contact: String,
  tags: {
    type: [String],
    enum: UserTagsSchema.enum
  },
  meta: Object,
  avatar: String
});

defineIndex(UserDocumentSchema, {
  key: { username: 1 },
  options: { unique: true }
});
defineIndex(UserDocumentSchema, { key: { createTime: -1 } });

export type UserMongooseSchemaType = InferSchemaType<typeof UserDocumentSchema>;
export type UserDocument = WithId__v<UserMongooseSchemaType>;

export const getUserModel = (client: Mongoose = mongoose): Model<UserMongooseSchemaType> => {
  const model = client.models.User as Model<UserMongooseSchemaType> | undefined;
  return model ?? client.model('User', UserDocumentSchema, tables.user);
};
