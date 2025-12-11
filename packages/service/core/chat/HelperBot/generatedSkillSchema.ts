import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { helperBotGeneratedSkillCollectionName } from './constants';
import type { HelperBotGeneratedSkillType } from '../../../../global/core/chat/helperBot/generatedSkill/type';

const GeneratedSkillToolSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ['tool', 'knowledge'], required: true }
  },
  { _id: false }
);

const GeneratedSkillStepSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    expectedTools: [GeneratedSkillToolSchema]
  },
  { _id: false }
);

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
  goal: String,
  taskType: String,
  steps: {
    type: [GeneratedSkillStepSchema],
    default: []
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  },
  metadata: Object
});

// 复合索引
HelperBotGeneratedSkillSchema.index({ userId: 1, teamId: 1, createTime: -1 });
HelperBotGeneratedSkillSchema.index({ tmbId: 1, status: 1 });
HelperBotGeneratedSkillSchema.index({ chatId: 1, chatItemId: 1 });
HelperBotGeneratedSkillSchema.index({ userId: 1, status: 1 });

export const MongoHelperBotGeneratedSkill = getMongoModel<HelperBotGeneratedSkillType>(
  helperBotGeneratedSkillCollectionName,
  HelperBotGeneratedSkillSchema
);
