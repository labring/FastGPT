/**
 * Agent Sandbox Schema
 *
 * Defines the database schema for skill sandbox instances.
 * Supports both edit-debug and session-runtime sandbox types.
 */

import { connectionMongo, getMongoModel } from '../../common/mongo';
import { sandboxInstanceCollectionName } from '@fastgpt/global/core/agentSkills/constants';
import type { SandboxInstanceSchemaType } from '@fastgpt/global/core/agentSkills/type';

const { Schema } = connectionMongo;

// Provider details are embedded in `detail` to avoid cross-collection joins.
//
// Indexes:
//   { sandboxId: 1 }            UNIQUE  -- provider sandbox ID lookup
//   { appId: 1, chatId: 1 }     UNIQUE  -- one instance per (appId, chatId) pair
//   { status: 1, lastActiveAt: 1 }      -- cron-based pausing queries
//   { 'detail.skillId': 1 }             -- edit-debug lookup by skillId

const SandboxInstanceSchema = new Schema({
  sandboxId: {
    type: String,
    required: true,
    unique: true
  },
  appId: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'team_members',
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['running', 'stopped'],
    required: true
  },
  lastActiveAt: {
    type: Date,
    default: () => new Date()
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  },
  detail: {
    sandboxType: {
      type: String,
      enum: ['edit-debug', 'session-runtime'],
      required: true
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'team',
      required: true
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: 'team_members',
      required: true
    },
    skillId: String,
    sessionId: String,
    skillIds: [Schema.Types.ObjectId],
    provider: {
      type: String,
      required: true,
      default: 'opensandbox'
    },
    image: {
      repository: { type: String, required: true },
      tag: { type: String, default: 'latest' }
    },
    providerStatus: {
      state: { type: String, required: true },
      message: String,
      reason: String
    },
    providerCreatedAt: {
      type: Date,
      required: true
    },
    endpoint: {
      host: String,
      port: Number,
      protocol: {
        type: String,
        enum: ['http', 'https'],
        default: 'http'
      },
      url: String
    },
    storage: {
      bucket: String,
      key: String,
      size: Number,
      uploadedAt: Date
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map()
    }
  }
});

try {
  // Unique index: one instance per (appId, chatId) pair
  SandboxInstanceSchema.index({ appId: 1, chatId: 1 }, { unique: true });

  // For cron-based pausing: find running instances by last active time
  SandboxInstanceSchema.index({ status: 1, lastActiveAt: 1 });

  // For edit-debug lookup by skillId
  SandboxInstanceSchema.index({ 'detail.skillId': 1 });
} catch (error) {
  console.log('SandboxInstance index error:', error);
}

export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  sandboxInstanceCollectionName,
  SandboxInstanceSchema
);
