import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
import type { McpOAuthStateRecordType } from './types';

const { Schema } = connectionMongo;

/**
 * MCP OAuth 唯一新增集合：一次性 state 台账（v2.4 §3.1、§4.2）。
 *
 * 不新增凭据、限流、日志、审计、回滚集合；业务有效期始终用 `expiresAt`
 * 显式比较，TTL 只负责最终清理。
 */

export const McpOAuthStateCollectionName = 'mcp_oauth_states';

export const MCP_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const MCP_OAUTH_STATE_PURGE_MS = 24 * 60 * 60 * 1000;
export const MCP_OAUTH_CLOCK_SKEW_MS = 30 * 1000;
export const MCP_OAUTH_REFRESH_LEASE_MS = 45 * 1000;
/** 单节点 OAuth 配置（含 token/client）的持久化大小上限。 */
export const MCP_OAUTH_NODE_MAX_BYTES = 16 * 1024;

export const McpOAuthStateSchema = new Schema<McpOAuthStateRecordType>(
  {
    _id: {
      type: String,
      required: true
    },
    v: {
      type: Number,
      default: 1
    },
    appId: {
      type: String,
      required: true
    },
    teamId: {
      type: String,
      required: true
    },
    nodeId: {
      type: String,
      required: true
    },
    tmbId: {
      type: String,
      required: true
    },
    bindCookieHash: {
      type: String,
      required: true
    },
    issuer: {
      type: String,
      required: true
    },
    resource: {
      type: String,
      required: true
    },
    clientIdHash: {
      type: String,
      required: true
    },
    redirectUri: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    purgeAt: {
      type: Date,
      required: true
    },
    consumedAt: {
      type: Date
    }
  },
  {
    minimize: false,
    collection: McpOAuthStateCollectionName
  }
);

defineIndex(McpOAuthStateSchema, { key: { purgeAt: 1 }, options: { expireAfterSeconds: 0 } });
defineIndex(McpOAuthStateSchema, { key: { appId: 1, createdAt: -1 } });
defineIndex(McpOAuthStateSchema, { key: { appId: 1, nodeId: 1, expiresAt: 1 } });

export const MongoMcpOAuthState = getMongoModel<McpOAuthStateRecordType>(
  McpOAuthStateCollectionName,
  McpOAuthStateSchema
);
