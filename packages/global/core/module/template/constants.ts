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
import { StopToolNode } from './system/stopTool';

import { RunAppModule } from './system/runApp';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { RunPluginModule } from './system/runPlugin';
import { AiQueryExtension } from './system/queryExtension';

import type { FlowNodeTemplateType, moduleTemplateListType } from '../../module/type.d';
import { FlowNodeTemplateTypeEnum } from '../../module/constants';
import { lafModule } from './system/laf';

/* app flow module templates */
export const appSystemModuleTemplates: FlowNodeTemplateType[] = [
  UserGuideModule,
  UserInputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  RunAppModule,
  ToolModule,
  StopToolNode,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  AiQueryExtension,
  lafModule
];
/* plugin flow module templates */
export const pluginSystemModuleTemplates: FlowNodeTemplateType[] = [
  PluginInputModule,
  PluginOutputModule,
  AiChatModule,
  AssignedAnswerModule,
  DatasetSearchModule,
  DatasetConcatModule,
  RunAppModule,
  ToolModule,
  StopToolNode,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  AiQueryExtension,
  lafModule
];

/* all module */
export const moduleTemplatesFlat: FlowNodeTemplateType[] = [
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
  StopToolNode,
  AiChatModule,
  RunAppModule,
  PluginInputModule,
  PluginOutputModule,
  RunPluginModule,
  AiQueryExtension,
  lafModule
];

export const moduleTemplatesList: moduleTemplateListType = [
  {
    type: FlowNodeTemplateTypeEnum.userGuide,
    label: '',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.textAnswer,
    label: 'core.module.template.Response module',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.functionCall,
    label: 'core.module.template.Function module',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: 'core.module.template.Tool module',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.externalCall,
    label: 'core.module.template.External module',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.personalPlugin,
    label: '',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: '其他',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: 'core.module.template.System input module',
    list: []
  }
];
