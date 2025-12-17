import { createDocument } from 'zod-openapi';
import { ChatPath } from './core/chat';
import { ApiKeyPath } from './support/openapi';
import { TagsMap } from './tag';
import { PluginPath } from './core/plugin';
import { WalletPath } from './support/wallet';
import { CustomDomainPath } from './support/customDomain';
import { AppPath } from './core/app';

export const openAPIDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FastGPT API',
    version: '0.1.0',
    description: 'FastGPT API 文档'
  },
  paths: {
    ...AppPath,
    ...ChatPath,
    ...ApiKeyPath,
    ...PluginPath,
    ...WalletPath,
    ...CustomDomainPath
  },
  servers: [{ url: '/api' }],
  'x-tagGroups': [
    {
      name: 'Agent 应用',
      tags: [TagsMap.appLog]
    },
    {
      name: '对话管理',
      tags: [TagsMap.chatHistory, TagsMap.chatPage, TagsMap.chatFeedback, TagsMap.chatSetting]
    },
    {
      name: '插件系统',
      tags: [TagsMap.pluginToolTag, TagsMap.pluginTeam]
    },
    {
      name: '支付系统',
      tags: [TagsMap.walletBill, TagsMap.walletDiscountCoupon]
    },
    {
      name: '通用-辅助功能',
      tags: [TagsMap.customDomain, TagsMap.apiKey]
    },
    {
      name: '管理员-插件管理',
      tags: [TagsMap.pluginAdmin, TagsMap.pluginMarketplace, TagsMap.pluginToolAdmin]
    }
  ]
});
