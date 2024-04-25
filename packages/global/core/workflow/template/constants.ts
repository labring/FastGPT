import { SystemConfigNode } from './system/systemConfig';
import { EmptyNode } from './system/emptyNode';
import { WorkflowStart } from './system/workflowStart';
import { AiChatModule } from './system/aiChat';
import { DatasetSearchModule } from './system/datasetSearch';
import { DatasetConcatModule } from './system/datasetConcat';
import { AssignedAnswerModule } from './system/assignedAnswer';
import { ClassifyQuestionModule } from './system/classifyQuestion';
import { ContextExtractModule } from './system/contextExtract';
import { HttpModule468 } from './system/http468';

import { ToolModule } from './system/tools';
import { StopToolNode } from './system/stopTool';

import { RunAppModule } from './system/runApp';
import { PluginInputModule } from './system/pluginInput';
import { PluginOutputModule } from './system/pluginOutput';
import { RunPluginModule } from './system/runPlugin';
import { AiQueryExtension } from './system/queryExtension';

import type { FlowNodeTemplateType, nodeTemplateListType } from '../type';
import { FlowNodeTemplateTypeEnum } from '../../workflow/constants';
import { lafModule } from './system/laf';
import { ifElseNode } from './system/ifElse/index';

/* app flow module templates */
export const appSystemModuleTemplates: FlowNodeTemplateType[] = [
  SystemConfigNode,
  WorkflowStart,
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
  lafModule,
  ifElseNode
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
  lafModule,
  ifElseNode
];

/* all module */
export const moduleTemplatesFlat: FlowNodeTemplateType[] = [
  EmptyNode,
  SystemConfigNode,
  WorkflowStart,
  AiChatModule,
  DatasetSearchModule,
  DatasetConcatModule,
  AssignedAnswerModule,
  ClassifyQuestionModule,
  ContextExtractModule,
  HttpModule468,
  ToolModule,
  StopToolNode,
  AiChatModule,
  RunAppModule,
  PluginInputModule,
  PluginOutputModule,
  RunPluginModule,
  AiQueryExtension,
  lafModule,
  ifElseNode
];

export const moduleTemplatesList: nodeTemplateListType = [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: 'core.module.template.System input module',
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
  }
];
