import { AIPath } from './core/ai';
import { SkillPath } from './core/ai/skill';
import { AppPath } from './core/app';
import { ChatPath } from './core/chat';
import { DatasetPath } from './core/dataset';
import { PluginPath } from './core/plugin';
import { WorkflowPath } from './core/workflow';
import { SupportPath } from './support';
import { AdminCorePath } from './admin/core';
import { AdminSupportPath } from './admin/support';
import { AdminSystemMigrationsPath } from './admin/common/system/migrations';
import { DevApiTagsMap } from './tag';
import type { OpenAPIPath } from './type';
import { CommonPath } from './common';
import { InvokePath } from './plugin';

export const openAPIPaths: NonNullable<OpenAPIPath> = {
  ...AppPath,
  ...ChatPath,
  ...DatasetPath,
  ...PluginPath,
  ...WorkflowPath,
  ...SupportPath,
  ...CommonPath,
  ...InvokePath,
  ...AIPath,
  ...SkillPath,
  ...AdminSystemMigrationsPath
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
      DevApiTagsMap.appEvaluation,
      DevApiTagsMap.appLog,
      DevApiTagsMap.publishChannel,
      DevApiTagsMap.mcpServer,
      DevApiTagsMap.workflowDebug,
      DevApiTagsMap.appOther
    ]
  },
  {
    name: '核心-工具管理',
    tags: [
      DevApiTagsMap.toolPreview,
      DevApiTagsMap.appSystemTool,
      DevApiTagsMap.httpTools,
      DevApiTagsMap.mcpTools
    ]
  },
  {
    name: '核心-技能',
    tags: [
      DevApiTagsMap.skillBasic,
      DevApiTagsMap.skillPermission,
      DevApiTagsMap.skillEdit,
      DevApiTagsMap.skillDebug,
      DevApiTagsMap.skillVersion
    ]
  },
  {
    name: '核心-AI 相关',
    tags: [DevApiTagsMap.sandbox, DevApiTagsMap.aiCommon]
  },
  {
    name: '核心 - AI 辅助生成',
    tags: [DevApiTagsMap.aiAuxiliary, DevApiTagsMap.workflowHelper]
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
      DevApiTagsMap.datasetPermission,
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
    tags: [DevApiTagsMap.userInform, DevApiTagsMap.userLogin]
  },
  {
    name: '辅助-团队体系',
    tags: [
      DevApiTagsMap.teamManage,
      DevApiTagsMap.teamPermission,
      DevApiTagsMap.teamMember,
      DevApiTagsMap.teamOrg,
      DevApiTagsMap.teamGroup,
      DevApiTagsMap.teamSubscription,
      DevApiTagsMap.teamInvitationLink,
      DevApiTagsMap.enterpriseAuth,
      DevApiTagsMap.userLimit
    ]
  },
  {
    name: '辅助-钱包',
    tags: [
      DevApiTagsMap.walletBill,
      DevApiTagsMap.walletUsage,
      DevApiTagsMap.walletInvoice,
      DevApiTagsMap.walletDiscountCoupon
    ]
  },
  {
    name: '辅助-权限管理',
    tags: [DevApiTagsMap.permissionResource, DevApiTagsMap.permissionCollaborator]
  },
  {
    name: '通用-基础功能',
    tags: [
      DevApiTagsMap.apiKey,
      DevApiTagsMap.customDomain,
      DevApiTagsMap.commonFile,
      DevApiTagsMap.commonSystem,
      DevApiTagsMap.commonOther
    ]
  },
  {
    name: '通用-反向调用',
    tags: [DevApiTagsMap.reverseInvokePlugin, DevApiTagsMap.reverseInvokeSandbox]
  },
  {
    name: '插件市场',
    tags: [DevApiTagsMap.pluginMarketplace]
  },
  {
    name: '管理员-插件管理',
    tags: [DevApiTagsMap.pluginAdmin, DevApiTagsMap.pluginToolAdmin]
  },
  {
    name: '管理员-系统接口',
    tags: [DevApiTagsMap.adminSystemMigration]
  }
];

export const adminOpenAPIPaths: NonNullable<OpenAPIPath> = {
  ...AdminCorePath,
  ...AdminSupportPath
};

export const adminOpenAPITagGroups = [
  {
    name: '管理员-系统接口',
    tags: [DevApiTagsMap.adminSystemMigration]
  },
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
