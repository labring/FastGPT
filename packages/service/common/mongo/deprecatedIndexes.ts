type DeprecatedMongoIndexOptions = {
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: unknown;
  collation?: unknown;
};

export type DeprecatedMongoIndexDefinition = {
  collectionName: string;
  indexName: string;
  key: Record<string, 1 | -1 | 'text' | 'hashed'>;
  options?: DeprecatedMongoIndexOptions;
  deprecatedVersion: string;
  reason: string;
  replacementIndexNames?: string[];
};

const deprecatedMongoIndexProperties = {
  version: {
    v4150Beta6: '4.15.0-beta6'
  },
  collection: {
    chat: 'chats',
    sandboxInstance: 'agent_sandbox_instances'
  },
  replacementIndex: {
    chatSourceIdentity: 'sourceType_1_appId_1_chatId_1',
    sandboxProviderIdentity: 'provider_1_sandboxId_1',
    sandboxSourceLookup: 'sourceType_1_sourceId_1_chatId_1'
  }
} as const;

const deprecatedChatIndexes: DeprecatedMongoIndexDefinition[] = [
  {
    collectionName: deprecatedMongoIndexProperties.collection.chat,
    indexName: 'appId_1_chatId_1',
    key: { appId: 1, chatId: 1 },
    options: { unique: true },
    deprecatedVersion: deprecatedMongoIndexProperties.version.v4150Beta6,
    reason: 'Chat identity index was expanded to include sourceType for source-aware chats.',
    replacementIndexNames: [deprecatedMongoIndexProperties.replacementIndex.chatSourceIdentity]
  }
];

const deprecatedSandboxIndexes: DeprecatedMongoIndexDefinition[] = [
  {
    collectionName: deprecatedMongoIndexProperties.collection.sandboxInstance,
    indexName: 'provider_1_appId_1_userId_1_chatId_1',
    key: { provider: 1, appId: 1, userId: 1, chatId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        appId: { $exists: true },
        userId: { $exists: true },
        chatId: { $exists: true }
      }
    },
    deprecatedVersion: deprecatedMongoIndexProperties.version.v4150Beta6,
    reason: 'Sandbox ownership moved from appId/userId/type fields to sourceType/sourceId.',
    replacementIndexNames: [
      deprecatedMongoIndexProperties.replacementIndex.sandboxProviderIdentity,
      deprecatedMongoIndexProperties.replacementIndex.sandboxSourceLookup
    ]
  },
  {
    collectionName: deprecatedMongoIndexProperties.collection.sandboxInstance,
    indexName: 'appId_1_chatId_1',
    key: { appId: 1, chatId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        appId: { $exists: true },
        chatId: { $exists: true },
        type: { $exists: true }
      }
    },
    deprecatedVersion: deprecatedMongoIndexProperties.version.v4150Beta6,
    reason: 'Sandbox appId/type lookup was replaced by sourceType/sourceId lookup.',
    replacementIndexNames: [deprecatedMongoIndexProperties.replacementIndex.sandboxSourceLookup]
  },
  {
    collectionName: deprecatedMongoIndexProperties.collection.sandboxInstance,
    indexName: 'metadata.skillId_1',
    key: { 'metadata.skillId': 1 },
    deprecatedVersion: deprecatedMongoIndexProperties.version.v4150Beta6,
    reason: 'Skill edit sandbox ownership no longer uses metadata.skillId.',
    replacementIndexNames: [deprecatedMongoIndexProperties.replacementIndex.sandboxSourceLookup]
  },
  {
    collectionName: deprecatedMongoIndexProperties.collection.sandboxInstance,
    indexName: 'type_1_chatId_1',
    key: { type: 1, chatId: 1 },
    deprecatedVersion: deprecatedMongoIndexProperties.version.v4150Beta6,
    reason: 'Sandbox type/chat lookup was replaced by sourceType/sourceId lookup.',
    replacementIndexNames: [deprecatedMongoIndexProperties.replacementIndex.sandboxSourceLookup]
  }
];

/**
 * FastGPT 历史版本明确废弃、允许通过维护脚本清理的 MongoDB 索引清单。
 *
 * 维护规则：
 * - 只记录 FastGPT 自己历史创建过的索引。
 * - 删除前必须精确匹配 collection、index name、key 和关键 options。
 * - 客户自建索引不要加入这里，即使它不在当前 schema 中。
 */
export const deprecatedMongoIndexes: DeprecatedMongoIndexDefinition[] = [
  ...deprecatedChatIndexes,
  ...deprecatedSandboxIndexes
];
