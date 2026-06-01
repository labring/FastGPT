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
    name: '核心-应用管理',
    tags: [
      TagsMap.appCommon,
      TagsMap.appFolder,
      TagsMap.appPer,
      TagsMap.appVersion,
      TagsMap.appTemplate,
      TagsMap.appLog,
      TagsMap.publishChannel
    ]
  },
  {
    name: '核心-工具管理',
    tags: [TagsMap.httpTools, TagsMap.mcpTools, TagsMap.mcpServer]
  },
  {
    name: '核心-AI 相关',
    tags: [TagsMap.aiSkill, TagsMap.sandbox, TagsMap.aiCommon]
  },
  {
    name: '核心-对话模块配置',
    tags: [TagsMap.chatSetting, TagsMap.chatPage, TagsMap.chatInputGuide]
  },
  {
    name: '核心-对话模块使用',
    tags: [
      TagsMap.chatHistory,
      TagsMap.chatFeedback,
      TagsMap.chatFile,
      TagsMap.chatRecord,
      TagsMap.chatController
    ]
  },
  {
    name: '核心-知识库',
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
    name: '核心-插件系统',
    tags: [TagsMap.pluginToolTag, TagsMap.pluginTeam]
  },
  {
    name: '辅助-用户体系',
    tags: [TagsMap.userInform, TagsMap.walletBill, TagsMap.walletDiscountCoupon, TagsMap.userLogin]
  },
  {
    name: '辅助-权限管理',
    tags: [TagsMap.permissionResource, TagsMap.permissionCollaborator]
  },
  {
    name: '通用-基础功能',
    tags: [TagsMap.apiKey, TagsMap.customDomain]
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
