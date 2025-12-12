import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { helperBotGeneratedSkillCollectionName } from './constants';
import type { HelperBotGeneratedSkillType } from '../../../../global/core/chat/helperBot/generatedSkill/type';

const HelperBotGeneratedSkillSchema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  tmbId: {
    type: String,
    required: true,
    index: true
  },
  teamId: {
    type: String,
    required: true,
    index: true
  },
  appId: {
    type: String,
    required: true,
    index: true
  },
  chatId: {
    type: String,
    required: true,
    index: true
  },
  chatItemId: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  steps: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  }
});

// 复合索引
HelperBotGeneratedSkillSchema.index({ teamId: 1, appId: 1, createTime: -1 });
HelperBotGeneratedSkillSchema.index({ userId: 1, teamId: 1, createTime: -1 });
HelperBotGeneratedSkillSchema.index({ tmbId: 1, status: 1 });
HelperBotGeneratedSkillSchema.index({ chatId: 1, chatItemId: 1 });
HelperBotGeneratedSkillSchema.index({ userId: 1, status: 1 });

export const MongoHelperBotGeneratedSkill = getMongoModel<HelperBotGeneratedSkillType>(
  helperBotGeneratedSkillCollectionName,
  HelperBotGeneratedSkillSchema
);
