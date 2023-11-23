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
import type { FlowModuleTemplateType } from '@fastgpt/global/core/module/type.d';

export const SystemModuleTemplates: FlowModuleTemplateType[] = [
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
export const PluginModuleTemplates: FlowModuleTemplateType[] = [
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
export const ModuleTemplatesFlat: FlowModuleTemplateType[] = [
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

// export const SystemModuleTemplates = [
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
// export const PluginModuleTemplates = [
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
