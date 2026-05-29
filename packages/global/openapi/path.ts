import { AIPath } from './core/ai';
import { SkillPath } from './core/ai/skill';
import { AppPath } from './core/app';
import { ChatPath } from './core/chat';
import { DatasetPath } from './core/dataset';
import { PluginPath } from './core/plugin';
import { SupportPath } from './support';
import { TagsMap } from './tag';
import type { OpenAPIPath } from './type';

export const openAPIPaths: NonNullable<OpenAPIPath> = {
  ...AppPath,
  ...ChatPath,
  ...DatasetPath,
  ...PluginPath,
  ...SupportPath,
  ...AIPath,
  ...SkillPath
};

export const openAPITagGroups = [
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
    tags: [TagsMap.aiSkill, TagsMap.sandbox, TagsMap.aiCommon]
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
    tags: [TagsMap.userInform, TagsMap.walletBill, TagsMap.walletDiscountCoupon, TagsMap.userLogin]
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
];
