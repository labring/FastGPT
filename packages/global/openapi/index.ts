import { createDocument } from 'zod-openapi';
import { ChatPath } from './core/chat';
import { TagsMap } from './tag';
import { PluginPath } from './core/plugin';
import { AppPath } from './core/app';
import { SupportPath } from './support';
import { DatasetPath } from './core/dataset';
import { AIPath } from './core/ai';
import { AgentSkillsPath } from './core/agentSkills';

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
    ...DatasetPath,
    ...PluginPath,
    ...SupportPath,
    ...AIPath,
    ...AgentSkillsPath
  },
  servers: [{ url: '/api' }],
  'x-tagGroups': [
    {
      name: '我的应用/工具管理',
      tags: [TagsMap.appCommon, TagsMap.mcpTools, TagsMap.httpTools, TagsMap.appPer]
    },
    {
      name: 'Agent 应用',
      tags: [TagsMap.appLog, TagsMap.publishChannel, TagsMap.mcpServer]
    },
    {
      name: 'AI 相关',
      tags: [TagsMap.aiSkill, TagsMap.sandbox]
    },
    {
      name: '对话模块配置',
      tags: [TagsMap.chatSetting, TagsMap.chatPage, TagsMap.chatInputGuide]
    },
    {
      name: '对话模块使用',
      tags: [
        TagsMap.chatHistory,
        TagsMap.chatFeedback,
        TagsMap.chatFile,
        TagsMap.chatRecord,
        TagsMap.chatController
      ]
    },
    {
      name: '知识库',
      tags: [
        TagsMap.datasetCommon,
        TagsMap.datasetCollection,
        TagsMap.datasetCollectionCrteate,
        TagsMap.datasetData,
        TagsMap.datasetFile,
        TagsMap.datasetTraining,
        TagsMap.datasetApiDataset
      ]
    },
    {
      name: '插件系统',
      tags: [TagsMap.pluginToolTag, TagsMap.pluginTeam]
    },
    {
      name: '用户体系',
      tags: [
        TagsMap.userInform,
        TagsMap.walletBill,
        TagsMap.walletDiscountCoupon,
        TagsMap.userLogin
      ]
    },
    {
      name: '通用-核心功能',
      tags: [TagsMap.aiCommon]
    },

    {
      name: '通用-辅助功能',
      tags: [TagsMap.customDomain, TagsMap.apiKey]
    },
    {
      name: '管理员-插件管理',
      tags: [TagsMap.pluginAdmin, TagsMap.pluginMarketplace, TagsMap.pluginToolAdmin]
    },
    {
      name: '系统接口',
      tags: [TagsMap.helperBot]
    }
  ]
});
