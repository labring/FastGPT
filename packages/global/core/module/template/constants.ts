import { UserGuideModule } from './system/userGuide';
import { UserInputModule } from './system/userInput';
import { AiChatModule } from './system/aiChat';
import { DatasetSearchModule } from './system/datasetSearch';
import { DatasetConcatModule } from './system/datasetConcat';
import { AssignedAnswerModule } from './system/assignedAnswer';
import { ClassifyQuestionModule } from './system/classifyQuestion';
import { ContextExtractModule } from './system/contextExtract';
import { HttpModule468 } from './system/http468';
import { HttpModule } from './system/abandon/http';
import { ToolModule } from './system/tools';

import { RunAppModule } from './system/runApp';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { RunPluginModule } from './system/runPlugin';
import { AiQueryExtension } from './system/queryExtension';

import type { FlowModuleTemplateType, moduleTemplateListType } from '../../module/type.d';
import { ModuleTemplateTypeEnum } from '../../module/constants';

/* app flow module templates */
export const appSystemModuleTemplates: FlowModuleTemplateType[] = [
  UserGuideModule,
  UserInputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  RunAppModule,
  ToolModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  AiQueryExtension
];
/* plugin flow module templates */
export const pluginSystemModuleTemplates: FlowModuleTemplateType[] = [
  PluginInputModule,
  PluginOutputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  RunAppModule,
  ToolModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  AiQueryExtension
];

/* all module */
export const moduleTemplatesFlat: FlowModuleTemplateType[] = [
  UserGuideModule,
  UserInputModule,
  AiChatModule,
  DatasetSearchModule,
  DatasetConcatModule,
  AssignedAnswerModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  HttpModule,
  ToolModule,
  AiChatModule,
  RunAppModule,
  PluginInputModule,
  PluginOutputModule,
  RunPluginModule,
  AiQueryExtension
];

export const moduleTemplatesList: moduleTemplateListType = [
  {
    type: ModuleTemplateTypeEnum.userGuide,
    label: 'core.module.template.Guide module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.systemInput,
    label: 'core.module.template.System input module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.textAnswer,
    label: 'core.module.template.Response module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.functionCall,
    label: 'core.module.template.Function module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.tools,
    label: 'core.module.template.Tool module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.externalCall,
    label: 'core.module.template.External module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.personalPlugin,
    label: 'core.module.template.My plugin module',
    list: []
  },
  {
    type: ModuleTemplateTypeEnum.other,
    label: '其他',
    list: []
  }
];
