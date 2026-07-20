import { AIPath } from './core/ai';
import { SkillPath } from './core/ai/skill';
import { AppPath } from './core/app';
import { ChatPath } from './core/chat';
import { DatasetPath } from './core/dataset';
import { PluginPath } from './core/plugin';
import { SupportPath } from './support';
import { AdminCorePath } from './admin/core';
import { AdminSupportPath } from './admin/support';
import { DevApiTagsMap } from './tag';
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
      DevApiTagsMap.appCommon,
      DevApiTagsMap.appFolder,
      DevApiTagsMap.appPer,
      DevApiTagsMap.appVersion,
      DevApiTagsMap.appTemplate,
      DevApiTagsMap.appLog,
      DevApiTagsMap.publishChannel
    ]
  },
  {
    name: '核心-工具管理',
    tags: [
      DevApiTagsMap.appSystemTool,
      DevApiTagsMap.httpTools,
      DevApiTagsMap.mcpTools,
      DevApiTagsMap.mcpServer
    ]
  },
  {
    name: '核心-AI 相关',
    tags: [DevApiTagsMap.aiSkill, DevApiTagsMap.sandbox, DevApiTagsMap.aiCommon]
  },
  {
    name: '核心-对话模块配置',
    tags: [DevApiTagsMap.chatSetting, DevApiTagsMap.chatPage, DevApiTagsMap.chatInputGuide]
  },
  {
    name: '核心-对话模块使用',
    tags: [
      DevApiTagsMap.chatHistory,
      DevApiTagsMap.chatFeedback,
      DevApiTagsMap.chatFile,
      DevApiTagsMap.chatRecord,
      DevApiTagsMap.chatController
    ]
  },
  {
    name: '核心-知识库',
    tags: [
      DevApiTagsMap.datasetCommon,
      DevApiTagsMap.datasetCollection,
      DevApiTagsMap.datasetCollectionCrteate,
      DevApiTagsMap.datasetData,
      DevApiTagsMap.datasetFile,
      DevApiTagsMap.datasetTraining,
      DevApiTagsMap.datasetApiDataset
    ]
  },
  {
    name: '核心-插件系统',
    tags: [DevApiTagsMap.pluginToolTag, DevApiTagsMap.pluginTeam, DevApiTagsMap.pluginDebug]
  },
  {
    name: '辅助-用户体系',
    tags: [
      DevApiTagsMap.userInform,
      DevApiTagsMap.walletBill,
      DevApiTagsMap.walletDiscountCoupon,
      DevApiTagsMap.userLogin
    ]
  },
  {
    name: '辅助-权限管理',
    tags: [DevApiTagsMap.permissionResource, DevApiTagsMap.permissionCollaborator]
  },
  {
    name: '通用-基础功能',
    tags: [DevApiTagsMap.apiKey, DevApiTagsMap.customDomain]
  },
  {
    name: '管理员-插件管理',
    tags: [
      DevApiTagsMap.pluginAdmin,
      DevApiTagsMap.pluginMarketplace,
      DevApiTagsMap.pluginToolAdmin
    ]
  },
  {
    name: '系统接口',
    tags: [DevApiTagsMap.chatAgentHelper]
  }
];

export const adminOpenAPIPaths: NonNullable<OpenAPIPath> = {
  ...AdminCorePath,
  ...AdminSupportPath
};

export const adminOpenAPITagGroups = [
  {
    name: '管理员-系统概览',
    tags: [DevApiTagsMap.adminDashboard, DevApiTagsMap.adminLogs, DevApiTagsMap.adminLicense]
  },
  {
    name: '管理员-资源管理',
    tags: [
      DevApiTagsMap.adminApps,
      DevApiTagsMap.adminUsers,
      DevApiTagsMap.adminTeams,
      DevApiTagsMap.adminDatasets
    ]
  },
  {
    name: '管理员-套餐与支付',
    tags: [
      DevApiTagsMap.adminPlans,
      DevApiTagsMap.adminPays,
      DevApiTagsMap.adminWalletCoupon,
      DevApiTagsMap.adminWalletInvoice,
      DevApiTagsMap.adminWalletRefund
    ]
  },
  {
    name: '管理员-系统配置',
    tags: [DevApiTagsMap.adminSettings, DevApiTagsMap.adminInform, DevApiTagsMap.adminAuth]
  },
  {
    name: '管理员-模板管理',
    tags: [DevApiTagsMap.adminTemplate, DevApiTagsMap.adminTemplateType]
  }
];
