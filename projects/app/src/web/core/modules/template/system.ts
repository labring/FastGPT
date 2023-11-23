import { UserGuideModule } from '@fastgpt/global/core/module/template/system/userGuide';
import { UserInputModule } from '@fastgpt/global/core/module/template/system/userInput';
import { HistoryModule } from '@fastgpt/global/core/module/template/system/history';
import { AiChatModule } from '@fastgpt/global/core/module/template/system/aiChat';
import { DatasetSearchModule } from '@fastgpt/global/core/module/template/system/datasetSearch';
import { AssignedAnswerModule } from '@fastgpt/global/core/module/template/system/assignedAnswer';
import { ClassifyQuestionModule } from '@fastgpt/global/core/module/template/system/classifyQuestion';
import { ContextExtractModule } from '@fastgpt/global/core/module/template/system/contextExtract';
import { HttpModule } from '@fastgpt/global/core/module/template/system/http';
import { EmptyModule } from '@fastgpt/global/core/module/template/system/empty';
import { RunAppModule } from '@fastgpt/global/core/module/template/system/runApp';
import { PluginInputModule } from '@fastgpt/global/core/module/template/system/pluginInput';
import { PluginOutputModule } from '@fastgpt/global/core/module/template/system/pluginOutput';
import { RunPluginModule } from '@fastgpt/global/core/module/template/system/runPlugin';
import type {
  FlowModuleTemplateType,
  moduleTemplateListType
} from '@fastgpt/global/core/module/type.d';
import { ModuleTemplateTypeEnum } from '@fastgpt/global/core/module/constants';

export const appSystemModuleTemplates: FlowModuleTemplateType[] = [
  UserGuideModule,
  UserInputModule,
  HistoryModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  RunAppModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule
];
export const pluginSystemModuleTemplates: FlowModuleTemplateType[] = [
  PluginInputModule,
  PluginOutputModule,
  HistoryModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  RunAppModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule
];
export const moduleTemplatesFlat: FlowModuleTemplateType[] = [
  UserGuideModule,
  UserInputModule,
  HistoryModule,
  AiChatModule,
  DatasetSearchModule,
  AssignedAnswerModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule,
  EmptyModule,
  RunAppModule,
  PluginInputModule,
  PluginOutputModule,
  RunPluginModule
];

export const moduleTemplatesList: moduleTemplateListType = [
  {
    type: ModuleTemplateTypeEnum.userGuide,
    label: '引导模块',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.systemInput,
    label: '系统输入',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.textAnswer,
    label: '文本输出',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.dataset,
    label: '知识库',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.functionCall,
    label: '函数调用',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.externalCall,
    label: '外部调用',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.personalPlugin,
    label: '个人插件',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.communityPlugin,
    label: '社区插件',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.commercialPlugin,
    label: '商业插件',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.other,
    label: '其他',
    list: []
  }
];
// export const appSystemModuleTemplates = [
//   {
//     label: '引导模块',
//     list: [UserGuideModule]
//   },
//   {
//     label: '输入模块',
//     list: [UserInputModule, HistoryModule]
//   },
//   {
//     label: '内容生成',
//     list: [AiChatModule, AssignedAnswerModule]
//   },
//   {
//     label: '核心调用',
//     list: [DatasetSearchModule, RunAppModule]
//   },
//   {
//     label: '函数模块',
//     list: [ClassifyQuestionModule, ContextExtractModule, HttpModule]
//   }
// ];
// export const pluginModuleTemplates = [
//   {
//     label: '输入输出',
//     list: [PluginInputModule, PluginOutputModule, HistoryModule]
//   },
//   {
//     label: '内容生成',
//     list: [AiChatModule, AssignedAnswerModule]
//   },
//   {
//     label: '核心调用',
//     list: [DatasetSearchModule, RunAppModule]
//   },
//   {
//     label: '函数模块',
//     list: [ClassifyQuestionModule, ContextExtractModule, HttpModule]
//   }
// ];
