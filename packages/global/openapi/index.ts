import { createDocument } from 'zod-openapi';
import { ChatPath } from './core/chat';
import { ApiKeyPath } from './support/openapi';
import { TagsMap } from './tag';
import { PluginPath } from './core/plugin';

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT API',
    version: '0.1.0',
    description: 'FastGPT API 文档'
  },
  paths: {
    ...ChatPath,
    ...ApiKeyPath,
    ...PluginPath
  },
  servers: [{ url: '/api' }],
  'x-tagGroups': [
    {
      name: '对话',
      tags: [TagsMap.chatSetting, TagsMap.chatPage]
    },
    {
      name: '插件相关',
      tags: [TagsMap.pluginToolTag, TagsMap.pluginTeam]
    },
    {
      name: '插件-管理员',
      tags: [TagsMap.pluginAdmin, TagsMap.pluginMarketplace, TagsMap.pluginToolAdmin]
    },
    {
      name: 'ApiKey',
      tags: [TagsMap.apiKey]
    }
  ]
});
