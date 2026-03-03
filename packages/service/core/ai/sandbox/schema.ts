import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType } from './type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { AppCollectionName } from '../../app/schema';

export const collectionName = 'agent_sandbox_instances';

const SandboxInstanceSchema = new Schema({
  sandboxId: {
    type: String,
    required: true,
    unique: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(SandboxStatusEnum),
    default: SandboxStatusEnum.running,
    required: true
  },
  lastActiveAt: {
    type: Date,
    default: () => new Date(),
    required: true
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
    required: true
  }
});

SandboxInstanceSchema.index({ appId: 1, chatId: 1 }, { unique: true });
SandboxInstanceSchema.index({ status: 1, lastActiveAt: 1 });

export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  collectionName,
  SandboxInstanceSchema
);
