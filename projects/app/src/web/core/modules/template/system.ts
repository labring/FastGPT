import { UserGuideModule } from '@fastgpt/global/core/module/template/system/userGuide';
import { UserInputModule } from '@fastgpt/global/core/module/template/system/userInput';
import { HistoryModule } from '@fastgpt/global/core/module/template/system/abandon/history';
import { AiChatModule } from '@fastgpt/global/core/module/template/system/aiChat';
import { DatasetSearchModule } from '@fastgpt/global/core/module/template/system/datasetSearch';
import { AssignedAnswerModule } from '@fastgpt/global/core/module/template/system/assignedAnswer';
import { ClassifyQuestionModule } from '@fastgpt/global/core/module/template/system/classifyQuestion';
import { ContextExtractModule } from '@fastgpt/global/core/module/template/system/contextExtract';
import { HttpModule } from '@fastgpt/global/core/module/template/system/http';
import { RunAppModule } from '@fastgpt/global/core/module/template/system/runApp';
import { PluginInputModule } from '@fastgpt/global/core/module/template/system/pluginInput';
import { PluginOutputModule } from '@fastgpt/global/core/module/template/system/pluginOutput';
import { RunPluginModule } from '@fastgpt/global/core/module/template/system/runPlugin';
import { AiCFR } from '@fastgpt/global/core/module/template/system/coreferenceResolution';

import type {
  FlowModuleTemplateType,
  moduleTemplateListType
} from '@fastgpt/global/core/module/type.d';
import { ModuleTemplateTypeEnum } from '@fastgpt/global/core/module/constants';

export const appSystemModuleTemplates: FlowModuleTemplateType[] = [
  UserGuideModule,
  UserInputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  RunAppModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule,
  AiCFR
];
export const pluginSystemModuleTemplates: FlowModuleTemplateType[] = [
  PluginInputModule,
  PluginOutputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  RunAppModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule,
  AiCFR
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
  RunAppModule,
  PluginInputModule,
  PluginOutputModule,
  RunPluginModule,
  AiCFR
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
    type: ModuleTemplateTypeEnum.tools,
    label: '工具',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.textAnswer,
    label: '文本输出',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.functionCall,
    label: '功能调用',
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
    type: ModuleTemplateTypeEnum.other,
    label: '其他',
    list: []
  }
];
